# Changelog

## [0.2.0](https://github.com/yannispgs/housemate/compare/v0.1.0...v0.2.0) (2026-10-02)


### Features

* **domain:** calcul de l'alerte de gel en véranda ([2a1cc78](https://github.com/yannispgs/housemate/commit/2a1cc78ce5fc7c9acf743b7c355c18b869afc717))
* **domain:** calcul du rappel de crèche selon la pluie ([55edcc4](https://github.com/yannispgs/housemate/commit/55edcc4651fc97d6b83466d058a6c33d4ba02e16))
* **domain:** calcul du rappel de crèche selon la pluie ([bda5308](https://github.com/yannispgs/housemate/commit/bda530824e8ae7f1e602fea99a91179412b209b2))
* **domain:** date civile sans heure ni fuseau ([21d4443](https://github.com/yannispgs/housemate/commit/21d4443ec2495eea8eddd01f4a74b4e32e036489))
* **domain:** masque de douze mois ([5cba7ae](https://github.com/yannispgs/housemate/commit/5cba7aebbaf423b9706cd5d5c0e2ad955520d40a))
* **domain:** moteur de récurrence, les neuf motifs ([963e66a](https://github.com/yannispgs/housemate/commit/963e66a3f1a4c6b4089eb6a079a2b52e3b7c9d20))
* **donnees:** socle foyer, fiches, échéances et complétions, protégé par RLS ([9c18324](https://github.com/yannispgs/housemate/commit/9c183241ef19f63b0096f7cba752c1378a4a108f))
* **donnees:** socle foyer, fiches, échéances et complétions, protégé par RLS ([38f48ac](https://github.com/yannispgs/housemate/commit/38f48acd0b23014128cba573a8690472cdbf5fa1))
* **meteo:** alerte de gel en véranda, du calcul au mail ([5921655](https://github.com/yannispgs/housemate/commit/5921655fc0b1a20280ded7bc0ffcdf0ab9b8ac3f))
* **meteo:** collecter aussi la pluie prévue, chaque soir à 22 h ([ab7cb14](https://github.com/yannispgs/housemate/commit/ab7cb1470bc2048ae54f51afb948ac2589298f17))
* **meteo:** collecteur de relevés et de prévisions ([113a8d0](https://github.com/yannispgs/housemate/commit/113a8d0273f27f04cbfc1e31e319adaa06c5ceb3))
* **meteo:** collecteur de relevés et de prévisions, sur Cloudflare Workers ([0b814cc](https://github.com/yannispgs/housemate/commit/0b814cc5574801b1bef6d1994f04c67f553810a8))
* **meteo:** prévision de la nuit pondérée par la fiabilité des modèles ([81de978](https://github.com/yannispgs/housemate/commit/81de9785363676fa52f8513bb0f46157809b16c2))
* **meteo:** veille de gel en véranda, du relevé de 20 h au mail ([8e1b51d](https://github.com/yannispgs/housemate/commit/8e1b51d7cc24001f4d1e27f9dbd4ef9706093c7f))
* **style:** auto-héberger Caprasimo et Figtree au lieu du CDN Google ([90d8f86](https://github.com/yannispgs/housemate/commit/90d8f868d33f50e639d4c9ba9f96fe75b9989cff))
* **style:** importe les jetons du design system Organic ([802d42d](https://github.com/yannispgs/housemate/commit/802d42de27dd3c9883656043e14e143e694f592a))
* **style:** jetons du design system Organic ([815ace7](https://github.com/yannispgs/housemate/commit/815ace752ac10c8ff67c32c37762e8d20e77e7f0))


### Bug Fixes

* **ci:** ne pas échouer tant que Codecov n'est pas configuré ([3cc51a3](https://github.com/yannispgs/housemate/commit/3cc51a3ad134ce285cb1378e0d85eda4f83689e4))
* **db:** base locale alignée sur Neon pour les rôles et le schéma auth ([e952f04](https://github.com/yannispgs/housemate/commit/e952f04e467b422360e483250db92178eff16dfd))
* **db:** les 18 remarques de SonarCloud sur la base locale ([6b32219](https://github.com/yannispgs/housemate/commit/6b32219e4d9fbbe9af48afacf822e798c8e578a4))
* les 12 problèmes relevés par SonarCloud sur main ([5df92e3](https://github.com/yannispgs/housemate/commit/5df92e342c3f8982a2a8ffc615eefe920f0eebb2))
* les 12 problèmes relevés par SonarCloud sur main ([82218f9](https://github.com/yannispgs/housemate/commit/82218f9a6afc1e31cc806071831334123ef8222f))
* **meteo:** nom du Worker et identifiant du compte, alignés sur Cloudflare ([d293d4d](https://github.com/yannispgs/housemate/commit/d293d4d61b8c3e34fb483d2c4dd2ff84346d6b54))
* **meteo:** problèmes relevés par SonarCloud sur la PR ([d4fc057](https://github.com/yannispgs/housemate/commit/d4fc0578be9c49d9f1d4b95673fcca1ddfe1a352))
* **meteo:** remarques SonarCloud et typage du test de la veille de gel ([cf60155](https://github.com/yannispgs/housemate/commit/cf6015529770d635fc2d3ff154ec14b778e666c6))
* **style:** polices dans le dépôt, build indépendant de Google ([d554b65](https://github.com/yannispgs/housemate/commit/d554b65d0d5a3853806d13da7a0164ae1173210b))
* **style:** polices dans le dépôt, pour que le build ne dépende plus de Google ([b9e37e3](https://github.com/yannispgs/housemate/commit/b9e37e391505c61e9d0c7bf8d41366f0cb5fb082))
* **style:** valeurs exactes des rôles, depuis le handoff de design ([8d67a78](https://github.com/yannispgs/housemate/commit/8d67a783ec320bd637c4fdc914a154b11b1572ca))
