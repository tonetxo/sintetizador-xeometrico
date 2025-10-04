// Ficheiro: src/ui.js

import state from './state.js';
import {
    DOM_IDS,
    DRAG_LIMITS,
    KEY_TO_MIDI_MAP,
    VCO1_WAVEFORMS,
    VCO2_WAVEFORMS,
    LFO1_TARGETS,
    LFO2_TARGETS,
    AUDIO_RAMP_TIME,
    SHORT_AUDIO_RAMP_TIME
} from './constants.js';
import { initializeAudio, triggerAttack, triggerRelease, resetAudioEngine } from './audio.js';
import { startStopSequencer, reloadSequencerUI } from './sequencer.js';
import { mapearRango, midiToFreq, getSvgCoordinates } from './utils.js';
import { gardarConfiguracion, cargarConfiguracion } from './file-io.js';

// --- Inicialización da UI ---

/**
 * Almacena en caché os elementos do DOM para un acceso máis rápido.
 */
export function cacheDomElements() {
    for (const key in DOM_IDS) {
        state.ui.domCache[DOM_IDS[key]] = document.getElementById(DOM_IDS[key]);
    }
    // Asegurarse de que os grupos SVG teñan unha transformación inicial
    ['vcoGroup', 'lfoGroup', 'ringModGroup'].forEach(id => {
        const element = state.ui.domCache[DOM_IDS[id]];
        if (element && element.transform.baseVal.numberOfItems === 0) {
            const lenzo = state.ui.domCache[DOM_IDS.lenzo];
            element.transform.baseVal.appendItem(lenzo.createSVGTransform());
        }
    });
}

/**
 * Rexistra todos os xestores de eventos da aplicación.
 */
export function registerEventListeners() {
    const lenzo = state.ui.domCache[DOM_IDS.lenzo];

    // Eventos do rato
    lenzo.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    lenzo.addEventListener('wheel', handleWheel);
    lenzo.addEventListener('contextmenu', handleContextMenu);

    // Eventos do teclado
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Botóns
    state.ui.domCache[DOM_IDS.playButton].addEventListener('click', startStopSequencer);
    state.ui.domCache[DOM_IDS.saveButton].addEventListener('click', gardarConfiguracion);
    state.ui.domCache[DOM_IDS.loadButton].addEventListener('click', cargarConfiguracion);
}

// --- Xestores de Eventos ---

function handleMouseDown(e) {
    if (e.button !== 0) return; // Só botón esquerdo
    if (!state.audio.isInitialized) initializeAudio();

    const target = e.target.closest('[data-draggable]');
    if (!target) return;

    e.preventDefault();
    const type = target.dataset.draggable;
    const lenzo = state.ui.domCache[DOM_IDS.lenzo];
    const startPoint = getSvgCoordinates(e.clientX, e.clientY, lenzo);

    state.ui.dragContext = {
        target,
        type,
        startPoint,
        initialPos: getInitialPositionForDrag(type, target)
    };

    if (type.startsWith('vco') && !state.audio.notaActiva) {
        triggerAttack();
        restaurarEstiloVCO(); // Asegurarse de que o estilo visual é correcto ao tocar
    }
}

function handleMouseMove(e) {
    if (!state.ui.dragContext.target) return;
    e.preventDefault();

    const lenzo = state.ui.domCache[DOM_IDS.lenzo];
    const currentPoint = getSvgCoordinates(e.clientX, e.clientY, lenzo);
    const delta = {
        x: currentPoint.x - state.ui.dragContext.startPoint.x,
        y: currentPoint.y - state.ui.dragContext.startPoint.y
    };
    const newPos = {
        x: state.ui.dragContext.initialPos.x + delta.x,
        y: state.ui.dragContext.initialPos.y + delta.y
    };

    // Usar requestAnimationFrame para optimizar o rendemento
    window.requestAnimationFrame(() => {
        updateControl(state.ui.dragContext.type, newPos, currentPoint);
    });
}

function handleMouseUp() {
    if (state.ui.dragContext.target && state.ui.dragContext.type.startsWith('vco')) {
        if (!state.audio.sustainActivado) {
            triggerRelease();
        }
    }
    state.ui.dragContext = {};
}

function handleContextMenu(e) {
    e.preventDefault();
    if (!state.audio.isInitialized) initializeAudio();

    const target = e.target.closest('[data-draggable]');
    if (!target) return;

    const type = target.dataset.draggable;

    if (e.shiftKey && type === 'vco2') {
        cambiarModoAfinacionVCO2();
        return;
    }

    switch (type) {
        case 'vco1': cambiarFormaDeOnda(1); break;
        case 'vco2': cambiarFormaDeOnda(2); break;
        case 'lfo1': cambiarDestinoLFO(1); break;
        case 'lfo2': cambiarDestinoLFO(2); break;
    }
}

function handleWheel(e) {
    if (!state.audio.isInitialized) return;
    const target = e.target;
    let feedback = false;

    if (target.id === DOM_IDS.vco2Circle) {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 1 : 10;
        let currentDetune = state.audio.nodes.vco2.detune.value;
        let newDetune = currentDetune - (direction * step);
        newDetune = Math.max(-1200, Math.min(1200, newDetune));
        state.audio.nodes.vco2.detune.setTargetAtTime(newDetune, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
        actualizarGlows();
    } else if (target.id === DOM_IDS.lfo1Circle || target.id === DOM_IDS.lfo2Circle) {
        e.preventDefault();
        feedback = true;
        const lfoState = target.id === DOM_IDS.lfo1Circle ? state.synth.lfo1 : state.synth.lfo2;
        const lfoNode = target.id === DOM_IDS.lfo1Circle ? state.audio.nodes.lfo1Node : state.audio.nodes.lfo2Node;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 1.02 : 1.1;
        let newRate = direction < 0 ? lfoState.rate * step : lfoState.rate / step;
        lfoState.rate = Math.max(0.1, Math.min(20, newRate));
        if (lfoNode) lfoNode.frequency.setTargetAtTime(lfoState.rate, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
    } else if (target.id === DOM_IDS.vcfControl) {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 2 : 10;
        let currentY = parseFloat(state.ui.domCache[DOM_IDS.vcfControl].getAttribute('y'));
        let newY = currentY + (direction * step);
        const { x } = state.ui.positions.vcf;
        updateControl('vcf', { x, y: newY });
    }

    if (feedback) mostrarFeedbackRoda();
}

function handleKeyDown(e) {
    if (e.code === 'Space' && state.audio.notaActiva) {
        e.preventDefault();
        state.audio.sustainActivado = !state.audio.sustainActivado;
        actualizarGlows();
        if (!state.audio.sustainActivado && !state.audio.tecladoNotaActiva) {
            triggerRelease();
        }
        return;
    }

    const midiNote = KEY_TO_MIDI_MAP[e.code];
    if (midiNote && !e.repeat) {
        if (!state.audio.isInitialized) initializeAudio();

        const freq = midiToFreq(midiNote);
        const now = state.audio.audioContext.currentTime;
        const { vco1, vco2 } = state.audio.nodes;

        if (vco1) vco1.frequency.linearRampToValueAtTime(freq, now + SHORT_AUDIO_RAMP_TIME);
        if (vco2 && state.audio.nodes.ringModWet.gain.value < 0.01) {
            if (state.synth.vco2.tuningMode === 'relative') {
                vco2.frequency.linearRampToValueAtTime(freq, now + SHORT_AUDIO_RAMP_TIME);
            } else {
                const detuneHz = vco2.frequency.value - vco1.frequency.value;
                vco2.frequency.linearRampToValueAtTime(freq + detuneHz, now + SHORT_AUDIO_RAMP_TIME);
            }
        }

        if (!state.audio.tecladoNotaActiva) {
            triggerAttack();
        }
        state.audio.tecladoNotaActiva = e.code;
        state.audio.tecladoGlow = true;
        actualizarGlows();
    }
}

function handleKeyUp(e) {
    if (KEY_TO_MIDI_MAP[e.code] && e.code === state.audio.tecladoNotaActiva) {
        state.audio.tecladoNotaActiva = null;
        state.audio.tecladoGlow = false;
        if (!state.audio.sustainActivado) {
            triggerRelease();
        }
        actualizarGlows();
    }
}

// --- Funcións de Actualización da UI ---

/**
 * Dirixe a actualización do control correcto en función do tipo.
 * @param {string} type - O tipo de control que se está a arrastrar.
 * @param {{x:number, y:number}} newPos - A nova posición calculada.
 * @param {{x:number, y:number}} currentPoint - A posición actual do rato en coordenadas SVG.
 */
function updateControl(type, newPos, currentPoint) {
    switch (type) {
        case 'vco1':
        case 'vco2':
            updateVCO(newPos.x, newPos.y, currentPoint);
            break;
        case 'lfo1':
        case 'lfo2':
            updateLFO(newPos.x, newPos.y);
            break;
        case 'ring-mod':
            updateRingMod(newPos.x, newPos.y);
            break;
        case 'vcf':
            updateVCF(newPos.x, newPos.y);
            break;
        case 'adsr':
            updateADSR(state.ui.dragContext.target.id, newPos.x, newPos.y);
            break;
        case 'delay':
            updateDelay(newPos.x, newPos.y);
            break;
        case 'tempo':
            updateTempo(newPos.x);
            break;
    }
}

// --- Sub-funcións de actualización para maior claridade ---

/**
 * Actualiza os parámetros de VCO1 (frecuencia, volume master) e o seu estilo visual.
 * @param {number} absoluteX - A coordenada X absoluta do control VCO.
 * @param {number} absoluteY - A coordenada Y absoluta do control VCO.
 * @returns {number} A frecuencia calculada para VCO1.
 */
function updateVCO1Params(absoluteX, absoluteY) {
    // A posición Y (vertical) mapease á frecuencia de forma perceptual (escala de notas MIDI).
    const notaMIDI = mapearRango(absoluteY, 320, 40, 24, 96); // Rango de 6 oitavas
    const freq = midiToFreq(notaMIDI);

    // A posición X (horizontal) mapease ao volume master.
    const volume = mapearRango(absoluteX, 40, 760, 0, 0.7);
    const { vco1, masterGain } = state.audio.nodes;
    const now = state.audio.audioContext.currentTime;

    if (vco1) vco1.frequency.setTargetAtTime(freq, now, AUDIO_RAMP_TIME);
    if (masterGain) masterGain.gain.setTargetAtTime(volume, now, AUDIO_RAMP_TIME);

    // A cor e o tamaño do círculo tamén dependen da posición.
    const hue = mapearRango(absoluteY, 40, 320, 240, 0); // O matiz cambia coa altura
    const radius = mapearRango(absoluteX, 40, 760, 20, 60); // O radio cambia co volume
    state.ui.domCache[DOM_IDS.vco1Circle].setAttribute('fill', `hsl(${hue}, 90%, 55%)`);
    state.ui.domCache[DOM_IDS.vco1Circle].setAttribute('r', radius);
    state.ui.domCache[DOM_IDS.vco2Circle].setAttribute('fill', `hsl(${hue}, 80%, 30%)`);

    return freq;
}

/**
 * Actualiza os parámetros de VCO2 (mix, detune/frecuencia) en función da súa posición relativa.
 * @param {number} relativeX - A coordenada X relativa ao centro de VCO1.
 * @param {number} relativeY - A coordenada Y relativa ao centro de VCO1.
 * @param {number} baseFreq - A frecuencia actual de VCO1.
 */
function updateVCO2Params(relativeX, relativeY, baseFreq) {
    const { vco1, vco2, vco2Gain, ringModWet } = state.audio.nodes;
    const now = state.audio.audioContext.currentTime;

    // A distancia vertical relativa ao centro controla a mestura (mix) de VCO2.
    const mix = mapearRango(relativeY, 70, -70, 0, 1);
    if (vco2Gain) vco2Gain.gain.setTargetAtTime(mix, now, AUDIO_RAMP_TIME);
    state.ui.domCache[DOM_IDS.vco2Circle].setAttribute('fill-opacity', mix);

    // Se a modulación en anel está activa, esta ten prioridade sobre o detune.
    if (ringModWet.gain.value > 0.01) return;

    // O modo de afinación ('relative' ou 'fixed') cambia o comportamento do control X.
    if (state.synth.vco2.tuningMode === 'relative') {
        // En modo 'relative', a distancia X controla o 'detune' en cents.
        const controlRangeX = 70;
        const fifthXPosition = (700 / 1200) * controlRangeX; // Posición para un intervalo de quinta perfecta (700 cents).

        // Engádese un "snap" para facilitar a afinación en unísono e en quintas.
        let detuneX = relativeX;
        if (Math.abs(relativeX) < 4) detuneX = 0; // Snap ao unísono
        else if (Math.abs(relativeX - fifthXPosition) < 4) detuneX = fifthXPosition; // Snap á quinta
        else if (Math.abs(relativeX + fifthXPosition) < 4) detuneX = -fifthXPosition; // Snap á quinta (negativa)

        const detune = mapearRango(detuneX, -controlRangeX, controlRangeX, -1200, 1200); // +/- 1 oitava
        if (vco2) {
            vco2.detune.setTargetAtTime(detune, now, AUDIO_RAMP_TIME);
            vco2.frequency.setTargetAtTime(baseFreq, now, AUDIO_RAMP_TIME); // A frecuencia base segue sendo a de VCO1.
        }
    } else {
        // En modo 'fixed', a distancia X controla un desfase de frecuencia fino en Hz.
        const detuneHz = mapearRango(relativeX, -70, 70, -50, 50); // +/- 50 Hz
        if (vco1 && vco2) {
            vco2.frequency.setTargetAtTime(vco1.frequency.value + detuneHz, now, AUDIO_RAMP_TIME);
            vco2.detune.setTargetAtTime(0, now, AUDIO_RAMP_TIME); // O detune en cents resetease.
        }
    }
}

/**
 * Calcula e aplica a profundidade de modulación para un LFO específico.
 * @param {number} lfoNum - O número do LFO (1 ou 2).
 */
function applyLFOModulation(lfoNum) {
    const lfoState = lfoNum === 1 ? state.synth.lfo1 : state.synth.lfo2;
    const depthNode = lfoNum === 1 ? state.audio.nodes.lfo1Depth : state.audio.nodes.lfo2Depth;
    const targetKey = lfoState.targets[lfoState.targetIndex];
    let modAmount = 0;
    const { depth } = lfoState;
    const { vco1, vco2 } = state.audio.nodes;

    // A cantidade de modulación ('modAmount') depende do destino.
    // Para frecuencias, é unha porcentaxe da frecuencia actual do oscilador.
    // Para outros parámetros (Q, detune), é un valor absoluto escalado pola profundidade.
    if (lfoNum === 1) {
        if (targetKey === 'VCO1 Freq') modAmount = (vco1.frequency.value * depth * 0.25);
        else if (targetKey === 'VCO2 Freq') modAmount = (vco2.frequency.value * depth * 0.25);
        else if (targetKey === 'VCF Freq') modAmount = depth * 5000; // Modulación de ata 5kHz no filtro
    } else {
        if (targetKey === 'VCO1 Freq') modAmount = (vco1.frequency.value * depth * 0.25);
        else if (targetKey === 'VCO2 Detune') modAmount = depth * 200; // Modulación de ata 200 cents
        else if (targetKey === 'VCF Q') modAmount = depth * 25; // Modulación de ata 25 na resonancia
    }

    // O 'modAmount' aplícase á ganancia do nodo de profundidade do LFO.
    if (depthNode) depthNode.gain.setTargetAtTime(modAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
}

// --- Funcións de Actualización da UI (Refactorizadas) ---

/**
 * Orquestra a actualización dos VCOs cando o control se move.
 * @param {number} x - Nova coordenada X do control.
 * @param {number} y - Nova coordenada Y do control.
 * @param {{x:number, y:number}} currentPoint - Posición actual do rato en coordenadas SVG.
 */
function updateVCO(x, y, currentPoint) {
    const { vco } = DRAG_LIMITS;
    const clampedX = Math.max(vco.xMin, Math.min(vco.xMax, x));
    const clampedY = Math.max(vco.yMin, Math.min(vco.yMax, y));

    // Move o grupo SVG enteiro.
    state.ui.domCache[DOM_IDS.vcoGroup].transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.vco = { x: clampedX, y: clampedY };

    // Calcula as posicións absolutas para o mapeo de parámetros.
    const absoluteX = 400 + clampedX;
    const absoluteY = 180 + clampedY;
    const vco1Freq = updateVCO1Params(absoluteX, absoluteY);

    // Calcula as posicións relativas para o control de VCO2.
    const centroAbsolutoVCO = { x: 400 + clampedX, y: 180 + clampedY };
    const relativeX = currentPoint.x - centroAbsolutoVCO.x;
    const relativeY = currentPoint.y - centroAbsolutoVCO.y;
    updateVCO2Params(relativeX, relativeY, vco1Freq);

    // Actualiza elementos visuais secundarios.
    actualizarGlows();
    actualizarLineasModulacion();
    // A frecuencia dos VCOs afecta á modulación dos LFOs, así que hai que actualizalos.
    updateLFO(state.ui.positions.lfo.x, state.ui.positions.lfo.y);
}


/**
 * Actualiza os parámetros dos LFOs cando o seu control se move.
 * @param {number} x - Nova coordenada X do control.
 * @param {number} y - Nova coordenada Y do control.
 */
function updateLFO(x, y) {
    if (!state.audio.isInitialized) return;
    const { lfo } = DRAG_LIMITS;
    const clampedX = Math.max(lfo.xMin, Math.min(lfo.xMax, x));
    const clampedY = Math.max(lfo.yMin, Math.min(lfo.yMax, y));

    state.ui.domCache[DOM_IDS.lfoGroup].transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.lfo = { x: clampedX, y: clampedY };

    const absX = 100 + clampedX;
    const absY = 100 + clampedY;

    // A posición X controla a velocidade (rate) do LFO1 de forma exponencial para un control máis musical.
    const normalizedPosition = mapearRango(absX, 0, 800, 0, 1);
    state.synth.lfo1.rate = 0.1 * Math.pow(20 / 0.1, normalizedPosition); // Mapeo exponencial de 0.1Hz a 20Hz.

    // A posición Y controla a profundidade (depth) de AMBOS LFOs.
    const depth = mapearRango(absY, 350, 0, 0, 1);
    state.synth.lfo1.depth = depth;
    state.synth.lfo2.depth = depth;

    // Aplica a nova velocidade ao nodo de audio do LFO1.
    if (state.audio.nodes.lfo1Node) {
        state.audio.nodes.lfo1Node.frequency.setTargetAtTime(state.synth.lfo1.rate, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
    }

    // Recalcula e aplica a modulación para ambos LFOs coa nova profundidade.
    applyLFOModulation(1);
    applyLFOModulation(2);

    actualizarLineasModulacion();
}


function updateRingMod(x, y) {
    // ... (Lóxica de actualización de Ring Mod)
    if (!state.ui.domCache[DOM_IDS.ringModGroup] || !state.audio.isInitialized) return;
    const { ringMod } = DRAG_LIMITS;
    const clampedX = Math.max(ringMod.xMin, Math.min(ringMod.xMax, x));
    const clampedY = Math.max(ringMod.yMin, Math.min(ringMod.yMax, y));
    state.ui.domCache[DOM_IDS.ringModGroup].transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.ringMod = { x: clampedX, y: clampedY };

    const absX = 600 + clampedX;
    const absY = 180 + clampedY;
    const wetAmount = mapearRango(absY, 30, 330, 1, 0);

    if (state.audio.nodes.ringModDry) state.audio.nodes.ringModDry.gain.setTargetAtTime(1 - wetAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
    if (state.audio.nodes.ringModWet) state.audio.nodes.ringModWet.gain.setTargetAtTime(wetAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);

    if (wetAmount > 0.01) {
        const minFreq = 20;
        const maxFreq = 2000;
        const normalizedPosition = mapearRango(absX, 400, 800, 0, 1);
        const freq = minFreq * Math.pow(maxFreq / minFreq, normalizedPosition);
        if (state.audio.nodes.vco2) {
            state.audio.nodes.vco2.frequency.setTargetAtTime(freq, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
            state.audio.nodes.vco2.detune.setTargetAtTime(0, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
        }
    }
}

function updateVCF(x, y) {
    // ... (Lóxica de actualización de VCF)
    const vcfControl = state.ui.domCache[DOM_IDS.vcfControl];
    const vcfJack = state.ui.domCache[DOM_IDS.vcfJack];
    const vcfW = parseFloat(vcfControl.getAttribute('width'));
    const clampedX = Math.max(0, Math.min(800 - vcfW, x));
    const { yMin, yMax } = DRAG_LIMITS.vcf;
    const maxHeight = yMax - yMin;
    const clampedY = Math.max(yMin, Math.min(yMax, y));
    const newHeight = Math.max(1, yMax - clampedY);

    vcfControl.setAttribute('x', clampedX);
    vcfControl.setAttribute('y', clampedY);
    vcfControl.setAttribute('height', newHeight);
    vcfJack.setAttribute('cx', clampedX + (vcfW / 2));
    vcfJack.setAttribute('cy', clampedY);

    state.ui.positions.vcf = { x: clampedX, y: clampedY };

    const { VCF_MIN_FREQ, VCF_MAX_FREQ, VCF_MIN_Q, VCF_MAX_Q } = DRAG_LIMITS;
    const freq = Math.exp(mapearRango(clampedX, 0, 800 - vcfW, Math.log(VCF_MIN_FREQ), Math.log(VCF_MAX_FREQ)));
    const q = mapearRango(newHeight, 1, maxHeight, VCF_MIN_Q, VCF_MAX_Q);

    if (state.audio.nodes.vcf) {
        const now = state.audio.audioContext.currentTime;
        state.audio.nodes.vcf.frequency.setTargetAtTime(freq, now, AUDIO_RAMP_TIME);
        state.audio.nodes.vcf.Q.setTargetAtTime(q, now, AUDIO_RAMP_TIME);
    }
    actualizarLineasModulacion();
}

function updateADSR(handleId, x, y) {
    // ... (Lóxica de actualización de ADSR)
    const { adsrAttack, adsrDecaySustain, adsrRelease } = state.ui.domCache;
    const { yMin, yMax } = DRAG_LIMITS.adsr;

    if (handleId) {
        if (handleId === DOM_IDS.adsrAttack) adsrAttack.setAttribute('cx', Math.max(50, x));
        else if (handleId === DOM_IDS.adsrDecaySustain) {
            adsrDecaySustain.setAttribute('cx', Math.max(parseFloat(adsrAttack.getAttribute('cx')) + 10, x));
            adsrDecaySustain.setAttribute('cy', Math.max(yMin, Math.min(yMax, y)));
        } else if (handleId === DOM_IDS.adsrRelease) adsrRelease.setAttribute('cx', Math.max(parseFloat(adsrDecaySustain.getAttribute('cx')) + 10, x));
    }

    const startX = 50;
    const attackX = parseFloat(adsrAttack.getAttribute('cx'));
    const decaySustainX = parseFloat(adsrDecaySustain.getAttribute('cx'));
    const decaySustainY = parseFloat(adsrDecaySustain.getAttribute('cy'));
    const releaseX = parseFloat(adsrRelease.getAttribute('cx'));

    state.synth.adsr.attack = mapearRango(attackX - startX, 1, 150, 0.01, 2.0);
    state.synth.adsr.decay = mapearRango(decaySustainX - attackX, 10, 150, 0.01, 2.0);
    state.synth.adsr.sustain = mapearRango(decaySustainY, yMax, yMin, 0.0, 1.0);
    state.synth.adsr.release = mapearRango(releaseX - decaySustainX, 10, 150, 0.01, 5.0);

    const p1 = `${startX},${yMax}`, p2 = `${attackX},${yMin}`, p3 = `${decaySustainX},${decaySustainY}`, p4 = `${releaseX},${yMax}`;
    state.ui.domCache[DOM_IDS.adsrShape].setAttribute('points', `${p1} ${p2} ${p3} ${p4}`);

    // Gardar posicións para poder restauralas
    state.ui.positions.adsr = {
        attack: { cx: attackX },
        decaySustain: { cx: decaySustainX, cy: decaySustainY },
        release: { cx: releaseX }
    };
}

function updateDelay(x, y) {
    // ... (Lóxica de actualización de Delay)
    const { delay } = DRAG_LIMITS;
    const clampedX = Math.max(delay.xMin, Math.min(delay.xMax, x));
    const clampedY = Math.max(delay.yMin, Math.min(delay.yMax, y));
    state.ui.domCache[DOM_IDS.delayHandle].setAttribute('cx', clampedX);
    state.ui.domCache[DOM_IDS.delayHandle].setAttribute('cy', clampedY);
    state.ui.positions.delay = { cx: clampedX, cy: clampedY };

    const delayTime = mapearRango(clampedX, delay.xMin, delay.xMax, 0.01, DRAG_LIMITS.DELAY_MAX_TIME);
    const feedbackAmount = mapearRango(clampedY, delay.yMax, delay.yMin, 0, DRAG_LIMITS.DELAY_MAX_FEEDBACK);
    const wetAmount = mapearRango(clampedY, delay.yMax, delay.yMin, 0, DRAG_LIMITS.DELAY_MAX_WET);

    const { delayNode, feedbackNode, wetGain } = state.audio.nodes;
    if (delayNode) delayNode.delayTime.setTargetAtTime(delayTime, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
    if (feedbackNode) feedbackNode.gain.setTargetAtTime(feedbackAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
    if (wetGain) wetGain.gain.setTargetAtTime(wetAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
}

function updateTempo(x) {
    // ... (Lóxica de actualización de Tempo)
    const { tempo } = DRAG_LIMITS;
    const clampedX = Math.max(tempo.xMin, Math.min(tempo.xMax, x));
    state.ui.domCache[DOM_IDS.tempoHandle].setAttribute('cx', clampedX);
    state.ui.positions.tempo.cx = clampedX;

    const newTempo = Math.round(mapearRango(clampedX, tempo.xMin, tempo.xMax, 60, 240));
    state.sequencer.tempo = newTempo;
    state.ui.domCache[DOM_IDS.tempoDisplay].textContent = `${newTempo} bpm`;

    if (state.sequencer.isPlaying) {
        clearInterval(state.sequencer.clockInterval);
        const intervalTime = 60000 / state.sequencer.tempo / 4;
        state.sequencer.clockInterval = setInterval(tick, intervalTime);
    }
}

// --- Outras Funcións da UI ---

export function mostrarFeedbackRoda() {
    document.body.style.transition = 'background-color 0.05s ease-in-out';
    document.body.style.backgroundColor = '#333';
    setTimeout(() => { document.body.style.backgroundColor = ''; }, 100);
}

export function actualizarGlows() {
    const { vco1Circle, vco2Circle } = state.ui.domCache;
    const detuneCents = state.audio.nodes.vco2.detune.value;
    const roundedDetune = Math.round(detuneCents);
    const isUnison = roundedDetune === 0;
    const isFifth = Math.abs(roundedDetune) === 700;
    const sustainGlow = state.audio.sustainActivado;
    const tecladoGlow = state.audio.tecladoGlow;

    vco1Circle.removeAttribute('stroke');
    vco1Circle.removeAttribute('stroke-width');
    vco2Circle.removeAttribute('stroke');
    vco2Circle.removeAttribute('stroke-width');

    if (isUnison) {
        vco1Circle.setAttribute('stroke', 'white');
        vco1Circle.setAttribute('stroke-width', '2');
        vco2Circle.setAttribute('stroke', 'white');
        vco2Circle.setAttribute('stroke-width', '3');
    } else if (isFifth) {
        const fifthGlowColor = '#ffd700';
        vco1Circle.setAttribute('stroke', fifthGlowColor);
        vco1Circle.setAttribute('stroke-width', '2');
        vco2Circle.setAttribute('stroke', fifthGlowColor);
        vco2Circle.setAttribute('stroke-width', '3');
    } else if (sustainGlow || tecladoGlow) {
        vco1Circle.setAttribute('stroke', '#80deea');
        vco1Circle.setAttribute('stroke-width', '4');
    }
}

export function animarLFOs() {
    if (!state.audio.isInitialized) return;
    requestAnimationFrame(animarLFOs);
    const agora = Date.now() / 1000;
    if (state.synth.lfo1) {
        const angulo1 = (agora * state.synth.lfo1.rate * 360) % 360;
        state.ui.domCache[DOM_IDS.lfo1Indicator].setAttribute('transform', `rotate(${angulo1}, 100, 100)`);
    }
    if (state.synth.lfo2) {
        const angulo2 = (agora * state.synth.lfo2.rate * 360) % 360;
        state.ui.domCache[DOM_IDS.lfo2Indicator].setAttribute('transform', `rotate(${angulo2}, 100, 100)`);
    }
}

export function notaACor(nota) {
    const hue = mapearRango(nota, 0, state.sequencer.notes - 1, 0, 300);
    return `hsl(${hue}, 90%, 55%)`;
}

export function actualizarEstiloCelda(cell, nota, volume) {
    if (volume > 0) {
        cell.style.fill = notaACor(nota);
        cell.style.opacity = 0.2 + volume * 0.8;
    } else {
        cell.style.fill = '#3c3c3c';
        cell.style.opacity = '1';
    }
}

// --- Aplicar Configuración ---

export function aplicarConfiguracion(settings) {
    try {
        if (!settings || !settings.positions || !settings.states) {
            console.error("O ficheiro de configuración é inválido ou está incompleto.");
            return;
        }
        resetAudioEngine();

        // Aplicar estados
        Object.assign(state.synth.vco1, settings.states.vco1);
        Object.assign(state.synth.vco2, settings.states.vco2);
        Object.assign(state.synth.lfo1, settings.states.lfo1);
        Object.assign(state.synth.lfo2, settings.states.lfo2);
        Object.assign(state.sequencer, settings.states.sequencer);
        state.sequencer.data = settings.states.sequencerData;

        // Aplicar posicións e actualizar a UI
        const { positions } = settings;
        updateVCO(positions.vcoGroup.x, positions.vcoGroup.y, { x: 0, y: 0 }); // O currentPoint non é crítico aquí
        updateLFO(positions.lfoGroup.x, positions.lfoGroup.y);
        if (positions.ringMod) updateRingMod(positions.ringMod.x, positions.ringMod.y);
        updateVCF(parseFloat(positions.vcf.x), parseFloat(positions.vcf.y));

        // Para ADSR, necesitamos establecer os atributos directamente e despois chamar a update
        const { adsrAttack, adsrDecaySustain, adsrRelease } = state.ui.domCache;
        adsrAttack.setAttribute('cx', positions.adsr.attack.cx);
        adsrDecaySustain.setAttribute('cx', positions.adsr.decaySustain.cx);
        adsrDecaySustain.setAttribute('cy', positions.adsr.decaySustain.cy);
        adsrRelease.setAttribute('cx', positions.adsr.release.cx);
        updateADSR(null); // Actualizar o estado de ADSR a partir da UI

        updateDelay(parseFloat(positions.delay.cx), parseFloat(positions.delay.cy));
        updateTempo(parseFloat(positions.tempo.cx));

        // Actualizar elementos visuais que dependen do estado
        cambiarFormaDeOnda(1, true);
        cambiarFormaDeOnda(2, true);
        cambiarDestinoLFO(1, true);
        cambiarDestinoLFO(2, true);
        reloadSequencerUI();

        console.log("Configuración aplicada con éxito.");
    } catch (error) {
        console.error("🛑 ERROR CRÍTICO ao aplicar a configuración:", error);
    }
}

// Funcións que quedaron aquí porque manipulan directamente a UI e o estado
function cambiarFormaDeOnda(numVCO, isInitial = false) {
    const vcoState = (numVCO === 1) ? state.synth.vco1 : state.synth.vco2;
    if (!isInitial) {
        vcoState.ondaActual = (vcoState.ondaActual + 1) % vcoState.waveforms.length;
    }
    const novaOnda = vcoState.waveforms[vcoState.ondaActual];
    const { vco1, noiseGenerator, vcf, ringModDry, ringModulator } = state.audio.nodes;

    if (numVCO === 1) {
        if (vco1 && vco1.numberOfOutputs > 0) vco1.disconnect();
        if (noiseGenerator && noiseGenerator.numberOfOutputs > 0) noiseGenerator.disconnect();

        if (novaOnda === 'noise') {
            noiseGenerator.connect(vcf);
        } else {
            vco1.type = novaOnda;
            vco1.connect(ringModDry);
            vco1.connect(ringModulator);
        }
    } else if (numVCO === 2 && state.audio.nodes.vco2) {
        state.audio.nodes.vco2.type = novaOnda;
    }

    document.querySelectorAll(`.onda-vco${numVCO}`).forEach(el => { el.style.display = 'none' });
    const iconToShow = document.getElementById(`vco${numVCO}-onda-${novaOnda}`);
    if (iconToShow) iconToShow.style.display = 'block';
}

function cambiarDestinoLFO(numLFO, isInitial = false) {
    const lfoState = (numLFO === 1) ? state.synth.lfo1 : state.synth.lfo2;
    if (!isInitial) {
        lfoState.targetIndex = (lfoState.targetIndex + 1) % lfoState.targets.length;
    }
    const depthNode = (numLFO === 1) ? state.audio.nodes.lfo1Depth : state.audio.nodes.lfo2Depth;
    if (depthNode) depthNode.disconnect();

    const targetKey = lfoState.targets[lfoState.targetIndex];
    const connections = (numLFO === 1) ? LFO1_TARGETS[targetKey] : LFO2_TARGETS[targetKey];
    const { vco1, vco2, vcf } = state.audio.nodes;

    connections.forEach(dest => {
        if (!depthNode) return;
        switch (dest) {
            case 'vco1_freq': if (vco1) depthNode.connect(vco1.frequency); break;
            case 'vco2_freq': if (vco2) depthNode.connect(vco2.frequency); break;
            case 'vco2_detune': if (vco2) depthNode.connect(vco2.detune); break;
            case 'vcf_freq': if (vcf) depthNode.connect(vcf.frequency); break;
            case 'vcf_q': if (vcf) depthNode.connect(vcf.Q); break;
        }
    });

    actualizarLineasModulacion();
    updateLFO(state.ui.positions.lfo.x, state.ui.positions.lfo.y); // Forzar actualización da intensidade
}

function cambiarModoAfinacionVCO2() {
    const vco2WaveIcons = document.getElementById('vco2-wave-icons');
    if (state.synth.vco2.tuningMode === 'relative') {
        state.synth.vco2.tuningMode = 'fixed';
        if (!document.getElementById('vco2-fixed-indicator')) {
            const plusIndicator = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            plusIndicator.setAttribute('id', 'vco2-fixed-indicator');
            plusIndicator.setAttribute('x', '0');
            plusIndicator.setAttribute('y', '-10');
            plusIndicator.setAttribute('font-size', '12');
            plusIndicator.setAttribute('fill', '#d4d4d4');
            plusIndicator.setAttribute('text-anchor', 'middle');
            plusIndicator.textContent = '+Hz';
            vco2WaveIcons.appendChild(plusIndicator);
        }
    } else {
        state.synth.vco2.tuningMode = 'relative';
        const plusIndicator = document.getElementById('vco2-fixed-indicator');
        if (plusIndicator) plusIndicator.remove();
    }
    // Forzar unha actualización para reflectir o cambio de modo
    updateVCO(state.ui.positions.vco.x, state.ui.positions.vco.y, { x: 0, y: 0 });
}

function actualizarLineasModulacion() {
    [1, 2].forEach(numLFO => {
        const line = (numLFO === 1) ? state.ui.domCache[DOM_IDS.lfo1ModLine] : state.ui.domCache[DOM_IDS.lfo2ModLine];
        const lfoState = (numLFO === 1) ? state.synth.lfo1 : state.synth.lfo2;
        const targetKey = lfoState.targets[lfoState.targetIndex];

        if (targetKey === 'OFF') {
            line.style.display = 'none';
            return;
        }

        const lfoMatrix = state.ui.domCache[DOM_IDS.lfoGroup].transform.baseVal.getItem(0).matrix;
        line.setAttribute('x1', lfoMatrix.e + 100);
        line.setAttribute('y1', lfoMatrix.f + 100);

        let targetX, targetY, targetColor;
        const { vcoGroup, vco1Circle, vco2Circle, vcfJack, vcfControl } = state.ui.domCache;

        if (targetKey.includes('VCO1')) {
            const vcoMatrix = vcoGroup.transform.baseVal.getItem(0).matrix;
            targetX = vcoMatrix.e + 400;
            targetY = vcoMatrix.f + 180;
            targetColor = vco1Circle.getAttribute('fill');
        } else if (targetKey.includes('VCO2')) {
            const vcoMatrix = vcoGroup.transform.baseVal.getItem(0).matrix;
            targetX = vcoMatrix.e + 400;
            targetY = vcoMatrix.f + 125;
            targetColor = vco2Circle.getAttribute('fill');
        } else if (targetKey.includes('VCF')) {
            targetX = parseFloat(vcfJack.getAttribute('cx'));
            targetY = parseFloat(vcfJack.getAttribute('cy'));
            targetColor = vcfControl.getAttribute('fill');
        } else {
            line.style.display = 'none';
            return;
        }

        line.setAttribute('x2', targetX);
        line.setAttribute('y2', targetY);
        line.setAttribute('stroke', targetColor);
        line.style.display = 'block';
    });
}

function restaurarEstiloVCO() {
    const { vco1Circle, vco2Circle } = state.ui.domCache;
    vco1Circle.setAttribute('fill', '#00bcd4');
    vco1Circle.setAttribute('r', 40);
    vco2Circle.setAttribute('fill', '#00838f');
    vco2Circle.setAttribute('fill-opacity', '1');
    actualizarGlows();
}

function getInitialPositionForDrag(type, target) {
    if (type.startsWith('vco')) return state.ui.positions.vco;
    if (type.startsWith('lfo')) return state.ui.positions.lfo;
    if (type.startsWith('ring-mod')) return state.ui.positions.ringMod;
    return {
        x: parseFloat(target.getAttribute('x')) || parseFloat(target.getAttribute('cx')),
        y: parseFloat(target.getAttribute('y')) || parseFloat(target.getAttribute('cy'))
    };
}

export function initializeAll() {
    cacheDomElements();
    registerEventListeners();
    // Restaurar a UI ao estado inicial definido no obxecto `state`
    aplicarConfiguracion({ positions: state.ui.positions, states: { ...state.synth, sequencer: state.sequencer, sequencerData: state.sequencer.data } });
    animarLFOs();
}