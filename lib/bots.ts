/**
 * Detección de tráfico automatizado.
 *
 * Existe porque el contador de clics no distinguía personas de rastreadores, y
 * eso hacía indescifrable el panel: 877 clics repartidos casi planos por las 24
 * horas, con las 3 de la madrugada por encima de las 20h, y tocando 194 de 202
 * productos. Ese patrón es el de un recorrido sistemático, no el de gente
 * comprando ropa. Sin separarlos no se puede saber si el problema es que falta
 * tráfico o que el tráfico no convierte.
 *
 * Los bots SIGUEN redirigiéndose con normalidad: no se les bloquea, solo se
 * anota su clic aparte para que no ensucie las métricas de negocio.
 *
 * La detección por user-agent no es infalible —un scraper puede mentir— pero
 * captura a la inmensa mayoría, que se identifican honestamente.
 */

/**
 * Fragmentos que, en minúsculas, delatan a un cliente automatizado.
 * Se comprueban como subcadena, así que basta la raíz del nombre.
 */
const BOT_SIGNATURES = [
  // Genéricos: cubren la mayoría de rastreadores que se identifican
  "bot",
  "crawler",
  "spider",
  "scraper",
  "crawl",

  // Buscadores que no llevan "bot" en el nombre
  "slurp",
  "duckduckgo",
  "baiduspider",
  "yandex",
  "sogou",
  "exabot",
  "facebot",
  "ia_archiver",

  // Redes sociales y previsualizadores de enlaces
  "facebookexternalhit",
  "whatsapp",
  "telegram",
  "skypeuripreview",
  "embedly",
  "quora link preview",
  "vkshare",
  "flipboard",
  "tumblr",
  "nuzzel",
  "outbrain",

  // Agentes de IA y recolectores de datos
  "gptbot",
  "chatgpt",
  "ccbot",
  "anthropic",
  "claude-web",
  "perplexity",
  "bytespider",
  "diffbot",
  "omgili",
  "cohere",

  // Librerías y herramientas de línea de comandos
  "curl/",
  "wget",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "httpx",
  "axios",
  "node-fetch",
  "go-http-client",
  "okhttp",
  "java/",
  "apache-httpclient",
  "libwww-perl",
  "guzzlehttp",
  "postman",
  "insomnia",
  "restsharp",

  // Navegadores automatizados
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",

  // Monitorización y seguridad
  "uptimerobot",
  "pingdom",
  "statuscake",
  "site24x7",
  "datadog",
  "newrelic",
  "zgrab",
  "masscan",
  "nmap",
  "censys",
  "shodan",
  "expanse",
];

/**
 * ¿Viene esta petición de un cliente automatizado?
 *
 * Un user-agent AUSENTE o vacío cuenta como bot: cualquier navegador real
 * envía uno, así que su ausencia solo se da en peticiones programáticas.
 */
export function isBotRequest(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;

  const ua = userAgent.toLowerCase().trim();
  if (ua.length === 0) return true;

  // Un user-agent absurdamente corto no lo manda ningún navegador.
  if (ua.length < 12) return true;

  return BOT_SIGNATURES.some((signature) => ua.includes(signature));
}

/**
 * Etiqueta con la que se guarda el clic.
 *
 * Los de bot se prefijan en la MISMA columna `source` en vez de añadir una
 * columna nueva: no hace falta migración, el dato sigue completo y visible, y
 * separarlos es un `LIKE 'bot:%'`. El histórico previo a este cambio queda
 * sin prefijo, así que hay que leerlo sabiendo que mezcla ambos.
 */
export function clickSource(source: string, isBot: boolean): string {
  const clean = source.slice(0, 34);
  return isBot ? `bot:${clean}` : clean;
}

/** True si una etiqueta de `click_events.source` corresponde a un bot. */
export function isBotSource(source: string | null): boolean {
  return source?.startsWith("bot:") ?? false;
}
