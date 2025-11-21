// Ficheiro: src/utils.js

/**
 * Mapea un valor dun rango de entrada a un rango de saída.
 * @param {number} valor - O valor a mapear.
 * @param {number} minEntrada - Mínimo do rango de entrada.
 * @param {number} maxEntrada - Máximo do rango de entrada.
 * @param {number} minSaida - Mínimo do rango de saída.
 * @param {number} maxSaida - Máximo do rango de saída.
 * @param {boolean} invertir - Se é true, invirte o resultado dentro do rango de saída.
 * @returns {number} O valor mapeado.
 */
export function mapearRango(valor, minEntrada, maxEntrada, minSaida, maxSaida, invertir = false) {
    if (maxEntrada === minEntrada) return minSaida;
    let val = (valor - minEntrada) / (maxEntrada - minEntrada);
    if (invertir) val = 1 - val;
    let clampedVal = Math.max(0, Math.min(1, val));
    return minSaida + clampedVal * (maxSaida - minSaida);
}

/**
 * Converte unha nota MIDI a frecuencia en Hz.
 * @param {number} midiNote - O número da nota MIDI.
 * @returns {number} A frecuencia en Hz.
 */
export function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Obtén as coordenadas SVG dun evento de rato.
 * @param {SVGSVGElement} svgElement - O elemento SVG.
 * @param {number} clientX - Coordenada X do cliente.
 * @param {number} clientY - Coordenada Y do cliente.
 * @returns {SVGPoint} O punto con coordenadas transformadas.
 */
export function getSvgCoordinates(svgElement, clientX, clientY) {
    const pt = svgElement.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svgElement.getScreenCTM().inverse());
}

/**
 * Converte unha nota (índice) a unha cor HSL.
 * @param {number} nota - O índice da nota.
 * @param {number} totalNotas - O número total de notas.
 * @returns {string} A cor en formato HSL.
 */
export function notaACor(nota, totalNotas) {
    const hue = mapearRango(nota, 0, totalNotas - 1, 0, 300);
    return `hsl(${hue}, 90%, 55%)`;
}

/**
 * Crea un buffer de ruído branco.
 * @param {AudioContext} audioContext - O contexto de audio.
 * @returns {AudioBuffer} O buffer de ruído.
 */
export function createWhiteNoiseBuffer(audioContext) {
    const bufferSize = 2 * audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    return buffer;
}
