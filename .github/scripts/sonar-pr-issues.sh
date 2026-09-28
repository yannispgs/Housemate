#!/usr/bin/env bash
#
# Fails the build when SonarCloud reports an unresolved issue on a pull
# request's new code.
#
# Why a script rather than a Quality Gate condition: the free SonarCloud plan
# cannot associate anything but the built-in "Sonar way" gate, and that gate's
# conditions only look at ratings, coverage and duplication — never at the issue
# count. This stands in for the `new_violations = 0` condition we are not
# allowed to configure.
#
# The project is public, so every endpoint read here needs no token.
set -euo pipefail

# SonarCloud derives the key from the GitHub repository at import time:
# `owner/Repo` becomes `owner_Repo`, case preserved.
readonly PROJECT_KEY="${SONAR_PROJECT_KEY:-${GITHUB_REPOSITORY/\//_}}"
readonly API="https://sonarcloud.io/api"
readonly POLL_INTERVAL=15
readonly POLL_ATTEMPTS=40 # 10 minutes

: "${PR_NUMBER:?PR_NUMBER is required}"
: "${HEAD_SHA:?HEAD_SHA is required}"

# A project that was never imported answers 404 on every endpoint. That is a
# setup step still to do, not a defect in the pull request: say so and pass,
# rather than letting `curl -f` fail the job with an unreadable error.
status=$(curl -sS -o /dev/null -w '%{http_code}' \
  "$API/components/show?component=$PROJECT_KEY")

if [[ "$status" = "404" ]]; then
  echo "::warning::SonarCloud project $PROJECT_KEY does not exist yet — import the repository on sonarcloud.io. Issue check skipped."
  exit 0
fi

# Automatic Analysis runs on SonarCloud's side, asynchronously, kicked off by the
# very push that started this workflow. Wait until the analysis it publishes is
# the one for THIS commit: reading too early grades the previous push, which
# would both miss new issues and re-report ones already fixed.
analysed_sha=""

for _ in $(seq "$POLL_ATTEMPTS"); do
  analysed_sha=$(
    curl -sSf "$API/project_pull_requests/list?project=$PROJECT_KEY" |
      jq -r --arg pr "$PR_NUMBER" \
        '.pullRequests[] | select(.key == $pr) | .commit.sha // ""'
  )

  if [[ "$analysed_sha" = "$HEAD_SHA" ]]; then
    break
  fi

  echo "Waiting for SonarCloud to analyse $HEAD_SHA (published: ${analysed_sha:-none})…"
  sleep "$POLL_INTERVAL"
done

if [[ "$analysed_sha" != "$HEAD_SHA" ]]; then
  # No analysis is not evidence of no issue, but it is not evidence of one
  # either — and a pull request touching only files Sonar has no analyser for
  # (Markdown, images) never gets one. Warn instead of blocking on it.
  echo "::warning::SonarCloud published no analysis for $HEAD_SHA within $((POLL_INTERVAL * POLL_ATTEMPTS))s — issue check skipped."
  exit 0
fi

issues=$(
  curl -sSf "$API/issues/search?componentKeys=$PROJECT_KEY&pullRequest=$PR_NUMBER&resolved=false&ps=500"
)
total=$(jq -r '.total' <<<"$issues")

if [[ "$total" -eq 0 ]]; then
  echo "SonarCloud reports no open issue on this pull request."
  exit 0
fi

# One annotation per issue, so each lands on its own line in the PR's diff.
jq -r --arg key "$PROJECT_KEY:" '
  .issues[] |
  "::error file=\(.component | ltrimstr($key)),line=\(.line // 1)::[\(.rule)] \(.message | gsub("\n"; " "))"
' <<<"$issues"

echo "SonarCloud reports $total open issue(s) on this pull request."
echo "Full list: https://sonarcloud.io/project/issues?id=$PROJECT_KEY&pullRequest=$PR_NUMBER&resolved=false"

exit 1
