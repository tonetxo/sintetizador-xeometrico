// Ficheiro: src/constants.js

// --- Constantes de Configuración do Sintetizador ---

export const NOTE_C4 = 60; // MIDI note for middle C

// Mapeo de teclas do teclado a notas MIDI
export const KEY_TO_MIDI_MAP = {
    'KeyA': 60, 'KeyS': 62, 'KeyD': 64, 'KeyF': 65, 'KeyG': 67, 'KeyH': 69, 'KeyJ': 71, 'KeyK': 72,
    'KeyW': 61, 'KeyE': 63, 'KeyT': 66, 'KeyY': 68, 'KeyU': 70
};

// Formas de onda dispoñibles para os osciladores
export const VCO1_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
export const VCO2_WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth'];

// Destinos de modulación para os LFOs
export const LFO1_TARGETS = {
    'OFF': [],
    'VCO1 Freq': ['vco1_freq'],
    'VCF Freq': ['vcf_freq'],
    'VCO2 Freq': ['vco2_freq']
};

export const LFO2_TARGETS = {
    'OFF': [],
    'VCO1 Freq': ['vco1_freq'],
    'VCO2 Detune': ['vco2_detune'],
    'VCF Q': ['vcf_q']
};

// Configuración do secuenciador
export const SEQUENCER_DEFAULTS = {
    steps: 16,
    notes: 12,
    tempo: 120,
};

// --- Constantes da Interface Gráfica (GUI) ---

// Límites para os controis arrastrables
export const DRAG_LIMITS = {
    vco: { xMin: -360, xMax: 360, yMin: -140, yMax: 140 },
    lfo: { xMin: -100, xMax: 700, yMin: -100, yMax: 250 },
    ringMod: { xMin: -200, xMax: 200, yMin: -150, yMax: 150 },
    vcf: { yMin: 1, yMax: 380 },
    adsr: { yMin: 280, yMax: 380 },
    delay: { xMin: 500, xMax: 660, yMin: 300, yMax: 380 },
    tempo: { xMin: 150, xMax: 280 }
};

// --- Constantes do Motor de Audio ---

export const VCF_MIN_FREQ = 20;
export const VCF_MAX_FREQ = 20000;
export const VCF_MIN_Q = 0.1;
export const VCF_MAX_Q = 25;

export const LFO_MIN_RATE = 0.1;
export const LFO_MAX_RATE = 20;

export const DELAY_MAX_TIME = 2.0;
export const DELAY_MAX_FEEDBACK = 0.9;
export const DELAY_MAX_WET = 0.7;

export const VCO_MAX_DETUNE_CENTS = 1200;
export const VCO_FIFTH_DETUNE_CENTS = 700;
export const VCO_DETUNE_SNAP_THRESHOLD = 4;
export const VCO_MAX_DETUNE_HZ = 50;

// Constantes de tempo para rampas de audio (para evitar "clics")
export const AUDIO_RAMP_TIME = 0.01;
export const SHORT_AUDIO_RAMP_TIME = 0.005;

// --- Identificadores de Elementos do DOM ---

export const DOM_IDS = {
    lenzo: 'lenzo-sintetizador',
    vcoGroup: 'vco-group',
    vco1Circle: 'vco1-circle',
    vco2Circle: 'vco2-circle',
    vcfControl: 'vcf',
    vcfJack: 'vcf-jack',
    adsrAttack: 'attack-handle',
    adsrDecaySustain: 'decay-sustain-handle',
    adsrRelease: 'release-handle',
    adsrShape: 'adsr-shape',
    lfoGroup: 'lfo-group',
    lfo1Indicator: 'lfo1-indicator',
    lfo2Indicator: 'lfo2-indicator',
    lfo1ModLine: 'lfo1-mod-line',
    lfo2ModLine: 'lfo2-mod-line',
    delayHandle: 'delay-handle',
    ringModGroup: 'ring-mod-group',
    sequencerGrid: 'sequencer-grid',
    playButton: 'play-button',
    playIcon: 'play-icon',
    stopIcon: 'stop-icon',
    tempoHandle: 'tempo-handle',
    tempoDisplay: 'tempo-display',
    playhead: 'playhead',
    saveButton: 'save-button',
    loadButton: 'load-button',
};