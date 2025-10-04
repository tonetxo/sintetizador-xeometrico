// Ficheiro: src/audio.js
import state from './state.js';
import {
    VCO1_WAVEFORMS,
    VCO2_WAVEFORMS,
    AUDIO_RAMP_TIME
} from './constants.js';
import { createWhiteNoiseBuffer } from './utils.js';

// --- Inicialización e Xestión do Motor de Audio ---

/**
 * Inicializa o AudioContext e todos os nodos de audio necesarios.
 * Conecta os nodos para formar a cadea de procesamento de son.
 */
export function initializeAudio() {
    if (state.audio.isInitialized) {
        if (state.audio.audioContext && state.audio.audioContext.state === 'suspended') {
            state.audio.audioContext.resume();
        }
        return;
    }

    const context = new (window.AudioContext || window.webkitAudioContext)();
    state.audio.audioContext = context;

    // Crear todos os nodos de audio
    const nodes = {
        vco1: context.createOscillator(),
        vco2: context.createOscillator(),
        vco2Gain: context.createGain(),
        noiseGenerator: context.createBufferSource(),
        vcf: context.createBiquadFilter(),
        vca: context.createGain(),
        masterGain: context.createGain(),
        lfo1Node: context.createOscillator(),
        lfo1Depth: context.createGain(),
        lfo2Node: context.createOscillator(),
        lfo2Depth: context.createGain(),
        delayNode: context.createDelay(2.0),
        feedbackNode: context.createGain(),
        dryGain: context.createGain(),
        wetGain: context.createGain(),
        limiter: context.createDynamicsCompressor(),
        ringModulator: context.createGain(),
        ringModDry: context.createGain(),
        ringModWet: context.createGain(),
    };
    state.audio.nodes = nodes;

    // --- Configuración e Conexións ---
    // A continuación, defínese o enrutamento do sinal de audio.

    // Ruído branco: prepárase pero conéctase máis tarde, cando se selecciona a súa forma de onda.
    nodes.noiseGenerator.buffer = createWhiteNoiseBuffer(context);
    nodes.noiseGenerator.loop = true;

    // --- CADEA DE SINAL PRINCIPAL ---

    // 1. O VCO1 e o VCO2 (a través da súa ganancia) mestúranse no nodo 'ringModDry'.
    //    Este é o camiño "seco" (sen modulación en anel).
    nodes.vco1.connect(nodes.ringModDry);
    nodes.vco2.connect(nodes.vco2Gain).connect(nodes.ringModDry);

    // 2. En paralelo, o VCO1 e o VCO2 aliméntanse ao modulador en anel.
    //    O VCO1 actúa como a portadora e o VCO2 como o modulador (a través da ganancia do nodo).
    nodes.vco1.connect(nodes.ringModulator);
    nodes.vco2.connect(nodes.ringModulator.gain);
    // A saída do modulador en anel vai ao nodo 'ringModWet'.
    nodes.ringModulator.connect(nodes.ringModWet);

    // 3. As saídas "seca" e "húmida" do modulador en anel, xunto co xerador de ruído,
    //    converxen todas na entrada do Filtro Controlado por Tensión (VCF).
    nodes.ringModDry.connect(nodes.vcf);
    nodes.ringModWet.connect(nodes.vcf);

    // 4. A saída do filtro (VCF) pasa a través do Amplificador Controlado por Tensión (VCA),
    //    que controla o volume final da nota (a nosa envolvente ADSR actúa aquí).
    //    De aí, vai a un nodo de ganancia mestre.
    nodes.vcf.connect(nodes.vca).connect(nodes.masterGain);

    // --- CADEA DE EFECTOS (DELAY) ---

    // 5. O sinal do 'masterGain' divídese en dous camiños:
    //    a) Camiño "seco" (dry): vai directamente ao limiter.
    nodes.masterGain.connect(nodes.dryGain);
    //    b) Camiño "húmido" (wet): envíase ao nodo de delay.
    nodes.masterGain.connect(nodes.delayNode);

    // 6. O delay ten un bucle de retroalimentación (feedback) para crear repeticións.
    //    A saída do delay volve a entrar nel a través dun nodo de ganancia de feedback.
    nodes.delayNode.connect(nodes.feedbackNode).connect(nodes.delayNode);
    // A saída do delay tamén vai ao nodo de ganancia "húmida" (wet).
    nodes.delayNode.connect(nodes.wetGain);

    // 7. Finalmente, os sinais "seco" e "húmido" mestúranse no limiter, que evita
    //    a saturación dixital, e de aí á saída de audio do dispositivo.
    nodes.dryGain.connect(nodes.limiter);
    nodes.wetGain.connect(nodes.limiter);
    nodes.limiter.connect(context.destination);

    // --- CADEA DE MODULACIÓN (LFOs) ---

    // 8. Os LFOs (Osciladores de Baixa Frecuencia) conéctanse aos seus respectivos nodos de profundidade (gain).
    //    Estes nodos de profundidade actuarán como atenuadores, controlando canta modulación se aplica.
    //    A saída destes nodos de profundidade conectarase dinamicamente aos destinos (p.ex., frecuencia do VCO1, corte do VCF).
    nodes.lfo1Node.connect(nodes.lfo1Depth);
    nodes.lfo2Node.connect(nodes.lfo2Depth);

    // --- Configuración de Valores Iniciais ---
    setupInitialAudioValues(nodes, context.currentTime);

    // Iniciar osciladores
    nodes.vco1.start();
    nodes.vco2.start();
    nodes.lfo1Node.start();
    nodes.lfo2Node.start();
    nodes.noiseGenerator.start();

    state.audio.isInitialized = true;
}

/**
 * Establece os valores por defecto para os nodos de audio.
 * @param {object} nodes - O obxecto cos nodos de audio.
 * @param {number} now - O tempo actual do AudioContext.
 */
function setupInitialAudioValues(nodes, now) {
    nodes.vco1.type = VCO1_WAVEFORMS[state.synth.vco1.ondaActual];
    nodes.vco2.type = VCO2_WAVEFORMS[state.synth.vco2.ondaActual];
    nodes.vco2.detune.setValueAtTime(0, now);
    nodes.vco2Gain.gain.setValueAtTime(0.5, now);

    nodes.vcf.type = 'lowpass';
    nodes.vca.gain.setValueAtTime(0, now);
    nodes.masterGain.gain.setValueAtTime(0.5, now);

    nodes.ringModDry.gain.setValueAtTime(1, now);
    nodes.ringModWet.gain.setValueAtTime(0, now);

    nodes.delayNode.delayTime.setValueAtTime(0.3, now);
    nodes.feedbackNode.gain.setValueAtTime(0.4, now);
    nodes.dryGain.gain.setValueAtTime(1.0, now);
    nodes.wetGain.gain.setValueAtTime(0.0, now);

    nodes.lfo1Node.type = 'sine';
    nodes.lfo2Node.type = 'triangle';
    nodes.lfo1Depth.gain.setValueAtTime(0, now);
    nodes.lfo2Depth.gain.setValueAtTime(0, now);

    nodes.limiter.threshold.setValueAtTime(-3, now);
    nodes.limiter.knee.setValueAtTime(0, now);
    nodes.limiter.ratio.setValueAtTime(20, now);
    nodes.limiter.attack.setValueAtTime(0, now);
    nodes.limiter.release.setValueAtTime(0.1, now);
}

// --- Control da Envolvente (ADSR) ---

/**
 * Activa a envolvente de volume (nota ON).
 */
export function triggerAttack() {
    const { vca } = state.audio.nodes;
    const { attack, decay, sustain } = state.synth.adsr;
    const now = state.audio.audioContext.currentTime;

    vca.gain.cancelScheduledValues(now);
    vca.gain.setValueAtTime(vca.gain.value, now); // Empezar dende o valor actual
    vca.gain.linearRampToValueAtTime(1.0, now + attack);
    vca.gain.linearRampToValueAtTime(sustain, now + attack + decay);

    state.audio.notaActiva = true;
    state.audio.sustainActivado = false;
}

/**
 * Desactiva a envolvente de volume (nota OFF).
 */
export function triggerRelease() {
    const { vca } = state.audio.nodes;
    const { release } = state.synth.adsr;
    const now = state.audio.audioContext.currentTime;

    vca.gain.cancelScheduledValues(now);
    vca.gain.setValueAtTime(vca.gain.value, now);
    vca.gain.linearRampToValueAtTime(0, now + release);

    state.audio.notaActiva = false;
}

/**
 * Activa unha nota do secuenciador coa súa propia envolvente.
 * @param {object} noteData - { midiNote, volume }
 */
export function triggerSequencerNote(noteData) {
    const { audioContext, nodes } = state.audio;
    const { adsr, vco1, vco2 } = state.synth;
    const { sequencer } = state;
    const now = audioContext.currentTime;

    // Duración da "porta" do secuenciador
    const tempoSeguro = (sequencer && sequencer.tempo > 0) ? sequencer.tempo : 120;
    const gateDuration = (60 / tempoSeguro / 4) * 0.9;

    // Aplicar frecuencia (se non é ruído)
    if (VCO1_WAVEFORMS[vco1.ondaActual] !== 'noise') {
        const freq = 440 * Math.pow(2, (noteData.midiNote - 69) / 12);
        if (isFinite(freq)) { // Engadir unha última comprobación por seguridade
            nodes.vco1.frequency.linearRampToValueAtTime(freq, now + AUDIO_RAMP_TIME);
            if (nodes.ringModWet.gain.value < 0.01) { // Só se o ring mod non está activo
                if (vco2.tuningMode === 'relative') {
                    nodes.vco2.frequency.linearRampToValueAtTime(freq, now + AUDIO_RAMP_TIME);
                } else {
                    const detuneHz = nodes.vco2.frequency.value - nodes.vco1.frequency.value;
                    nodes.vco2.frequency.linearRampToValueAtTime(freq + detuneHz, now + AUDIO_RAMP_TIME);
                }
            }
        }
    }

    // Envolvente ADSR específica para o secuenciador
    // Usamos isFinite para validar, xa que typeof NaN é 'number'.
    const attack = (adsr && isFinite(adsr.attack)) ? adsr.attack : 0.01;
    const decay = (adsr && isFinite(adsr.decay)) ? adsr.decay : 0.1;
    const sustain = (adsr && isFinite(adsr.sustain)) ? adsr.sustain : 0.5;
    const release = (adsr && isFinite(adsr.release)) ? adsr.release : 0.3;

    nodes.vca.gain.cancelScheduledValues(now);
    nodes.vca.gain.setValueAtTime(nodes.vca.gain.value, now);

    const attackEndTime = now + attack;
    nodes.vca.gain.linearRampToValueAtTime(noteData.volume, attackEndTime);

    const sustainLevel = sustain * noteData.volume;
    const decayEndTime = attackEndTime + decay;
    nodes.vca.gain.linearRampToValueAtTime(sustainLevel, decayEndTime);

    const gateOffTime = now + gateDuration;
    const releaseTimeConstant = Math.max(0.001, release / 3);
    nodes.vca.gain.setTargetAtTime(0, gateOffTime, releaseTimeConstant);
}

/**
 * Reinicia o motor de audio a un estado silencioso.
 * Útil antes de cargar unha nova configuración.
 */
export function resetAudioEngine() {
    if (!state.audio.isInitialized) return;
    const { nodes, audioContext } = state.audio;
    const now = audioContext.currentTime;

    nodes.vca.gain.cancelScheduledValues(now);
    nodes.vca.gain.setValueAtTime(0, now);
    nodes.feedbackNode.gain.setTargetAtTime(0, now, AUDIO_RAMP_TIME);
    nodes.wetGain.gain.setTargetAtTime(0, now, AUDIO_RAMP_TIME);

    state.audio.notaActiva = false;
    state.audio.sustainActivado = false;
}