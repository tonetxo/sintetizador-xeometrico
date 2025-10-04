// Ficheiro: src/state.js
import {
    VCO1_WAVEFORMS,
    VCO2_WAVEFORMS,
    LFO1_TARGETS,
    LFO2_TARGETS,
    SEQUENCER_DEFAULTS
} from './constants.js';

// --- Estado Global do Sintetizador ---

const state = {
    // Estado do Audio
    audio: {
        isInitialized: false,
        audioContext: null,
        nodes: {}, // Almacenará todos os nodos de audio (VCO, VCF, VCA, etc.)
        notaActiva: false,
        sustainActivado: false,
        tecladoNotaActiva: null,
        tecladoGlow: false,
    },

    // Estado dos compoñentes do sintetizador
    synth: {
        vco1: {
            ondaActual: 0,
            waveforms: VCO1_WAVEFORMS,
        },
        vco2: {
            ondaActual: 0,
            waveforms: VCO2_WAVEFORMS,
            tuningMode: 'relative', // 'relative' ou 'fixed'
        },
        lfo1: {
            rate: 2,
            depth: 0,
            targetIndex: 0,
            targets: Object.keys(LFO1_TARGETS),
        },
        lfo2: {
            rate: 0.5,
            depth: 0,
            targetIndex: 0,
            targets: Object.keys(LFO2_TARGETS),
        },
        adsr: {
            attack: 0.05,
            decay: 0.1,
            sustain: 0.6,
            release: 0.3,
        },
    },

    // Estado da Interface Gráfica (GUI)
    ui: {
        dragContext: {}, // Información sobre o elemento que se está arrastrando
        positions: { // Posicións dos elementos SVG móbiles
            vco: { x: 0, y: 0 },
            lfo: { x: 0, y: 0 },
            ringMod: { x: 0, y: 0 },
            vcf: { x: 720, y: 80 },
            adsr: {
                attack: { cx: 100 },
                decaySustain: { cx: 250, cy: 330 },
                release: { cx: 350 }
            },
            delay: { cx: 580, cy: 380 },
            tempo: { cx: 215 }
        },
        domCache: {}, // Caché para os elementos do DOM
    },

    // Estado do Secuenciador
    sequencer: {
        isPlaying: false,
        currentStep: 0,
        tempo: SEQUENCER_DEFAULTS.tempo,
        steps: SEQUENCER_DEFAULTS.steps,
        notes: SEQUENCER_DEFAULTS.notes,
        clockInterval: null,
        data: [], // Matriz de datos do secuenciador (step x note)
    },
};

// --- Funcións para acceder e modificar o estado ---

/**
 * Obtén o estado actual completo.
 * @returns {object} O obxecto de estado global.
 */
export function getState() {
    return state;
}

/**
 * Actualiza unha parte do estado de forma segura.
 * Exemplo: updateState('audio.notaActiva', true);
 * @param {string} path - A ruta do estado a actualizar (p.ex. 'synth.vco1.ondaActual').
 * @param {*} value - O novo valor.
 */
export function updateState(path, value) {
    const keys = path.split('.');
    let current = state;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
        if (typeof current === 'undefined') {
            console.error(`Estado non atopado para a ruta: ${path}`);
            return;
        }
    }
    current[keys[length - 1]] = value;
}

/**
 * Inicializa os datos do secuenciador no estado.
 */
export function initializeSequencerData() {
    state.sequencer.data = Array(state.sequencer.steps).fill(null).map(() =>
        Array(state.sequencer.notes).fill(0.0)
    );
}

export default state;