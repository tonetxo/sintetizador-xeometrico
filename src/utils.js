// Ficheiro: src/utils.js

/**
 * Mapea un valor dun rango de entrada a un rango de saída.
 * @param {number} valor - O valor de entrada a mapear.
 * @param {number} minEntrada - O límite inferior do rango de entrada.
 * @param {number} maxEntrada - O límite superior do rango de entrada.
 * @param {number} minSaida - O límite inferior do rango de saída.
 * @param {number} maxSaida - O límite superior do rango de saída.
 * @param {boolean} [invertir=false] - Se é true, invirte o resultado.
 * @returns {number} O valor mapeado.
 */
export function mapearRango(valor, minEntrada, maxEntrada, minSaida, maxSaida, invertir = false) {
    if (maxEntrada === minEntrada) {
        return minSaida;
    }
    let val = (valor - minEntrada) / (maxEntrada - minEntrada);
    if (invertir) {
        val = 1 - val;
    }
    // Asegurarse de que o valor estea dentro dos límites 0-1 antes de mapear á saída
    const clampedVal = Math.max(0, Math.min(1, val));
    return minSaida + clampedVal * (maxSaida - minSaida);
}

/**
 * Convirte unha nota MIDI a frecuencia en Hertz.
 * @param {number} midiNote - A nota MIDI (p.ex., 69 para A4).
 * @returns {number} A frecuencia correspondente en Hz.
 */
export function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Crea un buffer de audio con ruído branco.
 * @param {AudioContext} audioContext - O contexto de audio actual.
 * @returns {AudioBuffer} Un buffer de audio cheo de ruído branco.
 */
export function createWhiteNoiseBuffer(audioContext) {
    const bufferSize = 2 * audioContext.sampleRate; // 2 segundos de ruído
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // Xerar valores aleatorios entre -1 e 1
    }
    return buffer;
}

/**
 * Obtén as coordenadas SVG a partir das coordenadas do cliente (rato).
 * @param {number} x - Coordenada X do cliente.
 * @param {number} y - Coordenada Y do cliente.
 * @param {SVGSVGElement} lenzo - O elemento SVG principal.
 * @returns {{x: number, y: number}} As coordenadas transformadas dentro do SVG.
 */
export function getSvgCoordinates(x, y, lenzo) {
    const pt = lenzo.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(lenzo.getScreenCTM().inverse());
}