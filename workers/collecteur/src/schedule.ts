/**
 * Quand collecter, en heure de Paris.
 *
 * Le déclencheur Cloudflare tourne à chaque heure pleine, en UTC. C'est ici, et
 * pas dans le cron, que se décide ce qu'on fait : un cron écrit en UTC se
 * décalerait d'une heure à chaque changement d'heure, et « 20 h » deviendrait
 * 19 h ou 21 h deux fois par an.
 */

const PARIS_HOUR = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * L'heure qu'il est à Paris à cet instant, de 0 à 23.
 *
 * Par la partie `hour` et non par la chaîne formatée : en français, `Intl`
 * écrit « 20 h », et `Number("20 h")` vaut `NaN`.
 */
export function parisHour(instant: Date): number {
  const hour = PARIS_HOUR.formatToParts(instant).find(
    part => part.type === "hour",
  );

  return Number(hour?.value);
}

/**
 * Relever les capteurs de 20 h à 9 h (SPEC § 12.7) : le relevé du soir qui
 * décide de l'alerte, puis les minima de la nuit. Le jour, rien à apprendre
 * pour le gel — et chaque relevé réveille la base.
 */
export function shouldReadSensors(hour: number): boolean {
  return hour >= 20 || hour <= 9;
}

/** Les températures prévues se figent à 20 h, avec le relevé du gel. */
export function shouldFetchTemperatureForecasts(hour: number): boolean {
  return hour === 20;
}

/**
 * La pluie prévue se fige à 22 h, l'heure du rappel de crèche (SPEC § 12.9),
 * pour qu'il décide sur la prévision la plus fraîche. Tous les soirs, pas
 * seulement les veilles de crèche : autant de soirées de plus pour comparer
 * les modèles, pour un appel de plus par jour.
 */
export function shouldFetchRainForecasts(hour: number): boolean {
  return hour === 22;
}
