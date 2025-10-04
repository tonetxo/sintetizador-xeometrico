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
    SHORT_AUDIO_RAMP_TIME,
    VCF_MIN_FREQ,
    VCF_MAX_FREQ,
    VCF_MIN_Q,
    VCF_MAX_Q,
    DELAY_MAX_TIME,
    DELAY_MAX_FEEDBACK,
    DELAY_MAX_WET
} from './constants.js';
import { initializeAudio, triggerAttack, triggerRelease, resetAudioEngine } from './audio.js';
import { startStopSequencer, reloadSequencerUI, initializeSequencer } from './sequencer.js';
import { mapearRango, midiToFreq, getSvgCoordinates } from './utils.js';
import { gardarConfiguracion, cargarConfiguracion } from './file-io.js';

// --- Inicialización da UI ---

export function cacheDomElements() {
    for (const key in DOM_IDS) {
        state.ui.domCache[key] = document.getElementById(DOM_IDS[key]);
    }
    ['vcoGroup', 'lfoGroup', 'ringModGroup'].forEach(id => {
        const element = state.ui.domCache[id];
        if (element && element.transform.baseVal.numberOfItems === 0) {
            const lenzo = state.ui.domCache.lenzo;
            element.transform.baseVal.appendItem(lenzo.createSVGTransform());
        }
    });
}

export function registerEventListeners() {
    const { domCache } = state.ui;
    domCache.lenzo.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domCache.lenzo.addEventListener('wheel', handleWheel);
    domCache.lenzo.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    domCache.playButton.addEventListener('click', startStopSequencer);
    domCache.saveButton.addEventListener('click', gardarConfiguracion);
    domCache.loadButton.addEventListener('click', cargarConfiguracion);
}

// --- Sincronización de Estado e Audio ---

/**
 * Aplica todos os parámetros do obxecto `state` aos nodos de audio correspondentes.
 * Esta función é a ÚNICA que traduce o estado da aplicación a son.
 */
function syncAudioParamsFromState() {
    if (!state.audio.isInitialized) return;

    const { nodes, audioContext } = state.audio;
    const { synth, sequencer } = state;
    const now = audioContext.currentTime;

    // Sincronizar VCOs (só se non hai unha nota de teclado activa)
    if (!state.audio.tecladoNotaActiva) {
        const notaMIDI = mapearRango(state.ui.positions.vco.y + 180, 320, 40, 24, 96);
        const freq = midiToFreq(notaMIDI);
        nodes.vco1.frequency.setTargetAtTime(freq, now, AUDIO_RAMP_TIME);
        if (synth.vco2.tuningMode === 'relative') {
            nodes.vco2.frequency.setTargetAtTime(freq, now, AUDIO_RAMP_TIME);
        }
    }
    nodes.vco2.detune.setTargetAtTime(mapearRango(state.ui.positions.vco.x, -70, 70, -1200, 1200), now, AUDIO_RAMP_TIME);

    // Sincronizar Master Gain
    const volume = mapearRango(state.ui.positions.vco.x + 400, 40, 760, 0, 0.7);
    nodes.masterGain.gain.setTargetAtTime(volume, now, AUDIO_RAMP_TIME);

    // Sincronizar LFOs
    nodes.lfo1Node.frequency.setTargetAtTime(synth.lfo1.rate, now, AUDIO_RAMP_TIME);
    nodes.lfo2Node.frequency.setTargetAtTime(synth.lfo2.rate, now, AUDIO_RAMP_TIME);
    applyLFOModulation(1);
    applyLFOModulation(2);

    // Sincronizar Ring Modulator
    const { x: ringModX, y: ringModY } = state.ui.positions.ringMod;
    const wetGainValue = mapearRango(ringModX, DRAG_LIMITS.ringMod.xMin, DRAG_LIMITS.ringMod.xMax, 0, 1);
    const dryGainValue = 1 - wetGainValue;

    if (isFinite(wetGainValue)) nodes.ringModWet.gain.setTargetAtTime(wetGainValue, now, AUDIO_RAMP_TIME);
    if (isFinite(dryGainValue)) nodes.ringModDry.gain.setTargetAtTime(dryGainValue, now, AUDIO_RAMP_TIME);

    // Sincronizar VCF
    const { x: vcfX, y: vcfY } = state.ui.positions.vcf;
    const { yMin, yMax } = DRAG_LIMITS.vcf;
    const vcfW = parseFloat(state.ui.domCache.vcfControl.getAttribute('width'));

    // CORRECCIÓN: A posición Y controla a frecuencia (logarítmica), a X controla a resonancia (Q).
    // A frecuencia (eixo Y) asígnaselle unha escala logarítmica para unha percepción máis natural.
    const freq = Math.exp(mapearRango(vcfY, yMax, yMin, Math.log(VCF_MIN_FREQ), Math.log(VCF_MAX_FREQ)));
    // A resonancia (eixo X) asígnaselle unha escala lineal.
    const q = mapearRango(vcfX, 0, 800 - vcfW, VCF_MIN_Q, VCF_MAX_Q);

    if (isFinite(freq)) nodes.vcf.frequency.setTargetAtTime(freq, now, AUDIO_RAMP_TIME);
    if (isFinite(q)) nodes.vcf.Q.setTargetAtTime(q, now, AUDIO_RAMP_TIME);

    // Sincronizar Delay
    const { cx: delayX, cy: delayY } = state.ui.positions.delay;
    const { delay } = DRAG_LIMITS;
    const delayTime = mapearRango(delayX, delay.xMin, delay.xMax, 0.01, DELAY_MAX_TIME);
    const feedbackAmount = mapearRango(delayY, delay.yMax, delay.yMin, 0, DELAY_MAX_FEEDBACK);
    const wetAmount = mapearRango(delayY, delay.yMax, delay.yMin, 0, DELAY_MAX_WET);
    const dryAmount = 1 - wetAmount; // Make dry amount inversely proportional to wet amount

    if (isFinite(delayTime)) nodes.delayNode.delayTime.setTargetAtTime(delayTime, now, AUDIO_RAMP_TIME);
    if (isFinite(feedbackAmount)) nodes.feedbackNode.gain.setTargetAtTime(feedbackAmount, now, AUDIO_RAMP_TIME);
    if (isFinite(wetAmount)) nodes.wetGain.gain.setTargetAtTime(wetAmount, now, AUDIO_RAMP_TIME);
    if (isFinite(dryAmount)) nodes.dryGain.gain.setTargetAtTime(dryAmount, now, AUDIO_RAMP_TIME); // Update dryGain
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

    if (!vco1 || !vco2) return; // Evitar erros se os nodos non están listos

    // A cantidade de modulación ('modAmount') depende do destino.
    if (lfoNum === 1) {
        if (targetKey === 'VCO1 Freq') modAmount = (vco1.frequency.value * depth * 0.25);
        else if (targetKey === 'VCO2 Freq') modAmount = (vco2.frequency.value * depth * 0.25);
        else if (targetKey === 'VCF Freq') modAmount = depth * 5000;
    } else {
        if (targetKey === 'VCO1 Freq') modAmount = (vco1.frequency.value * depth * 0.25);
        else if (targetKey === 'VCO2 Detune') modAmount = depth * 200;
        else if (targetKey === 'VCF Q') modAmount = depth * 25;
    }

    if (depthNode) depthNode.gain.setTargetAtTime(modAmount, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
}

// --- Xestores de Eventos ---

function handleMouseDown(e) {
    if (e.button !== 0) return;
    
    // 🔥 NUEVO: Ignorar clicks en celdas del secuenciador
    if (e.target.classList.contains('sequencer-cell')) {
        return;
    }
    
    if (!state.audio.isInitialized) {
        initializeAudio();
        syncAudioParamsFromState();
    }

    const target = e.target.closest('[data-draggable]');
    if (!target) return;

    e.preventDefault();
    const type = target.dataset.draggable;
    const { lenzo } = state.ui.domCache;
    const startPoint = getSvgCoordinates(e.clientX, e.clientY, lenzo);

    state.ui.dragContext = { target, type, startPoint, initialPos: getInitialPositionForDrag(type, target) };

    if (type.startsWith('vco') && !state.audio.notaActiva) {
        triggerAttack();
        restaurarEstiloVCO();
    }
}

function handleMouseMove(e) {
    if (!state.ui.dragContext.target) return;
    e.preventDefault();

    const { lenzo } = state.ui.domCache;
    const currentPoint = getSvgCoordinates(e.clientX, e.clientY, lenzo);
    const delta = {
        x: currentPoint.x - state.ui.dragContext.startPoint.x,
        y: currentPoint.y - state.ui.dragContext.startPoint.y
    };
    const newPos = {
        x: state.ui.dragContext.initialPos.x + delta.x,
        y: state.ui.dragContext.initialPos.y + delta.y
    };

    window.requestAnimationFrame(() => {
        updateControl(state.ui.dragContext.type, newPos, currentPoint);
    });
}

function handleMouseUp() {
    if (state.ui.dragContext.target && state.ui.dragContext.type.startsWith('vco')) {
        if (!state.audio.sustainActivado) triggerRelease();
    }
    state.ui.dragContext = {};
    state.ui.isDrawing = false; // 🔥 Resetear el flag de dibujo
    reloadSequencerUI(); // FIX: Reload sequencer UI after drag-drawing is finished
}

function handleContextMenu(e) {
    e.preventDefault();
    if (!state.audio.isInitialized) return;
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
    const { domCache } = state.ui;

    if (target.id === domCache.vco2Circle.id) {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 1 : 10;
        let currentDetune = state.audio.nodes.vco2.detune.value;
        let newDetune = currentDetune - (direction * step);
        newDetune = Math.max(-1200, Math.min(1200, newDetune));
        state.audio.nodes.vco2.detune.setTargetAtTime(newDetune, state.audio.audioContext.currentTime, AUDIO_RAMP_TIME);
        actualizarGlows();
    } else if (target.id === domCache.lfo1Circle.id || target.id === domCache.lfo2Circle.id) {
        e.preventDefault();
        feedback = true;
        const lfoNum = target.id === domCache.lfo1Circle.id ? 1 : 2;
        const lfoState = lfoNum === 1 ? state.synth.lfo1 : state.synth.lfo2;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 1.02 : 1.1;
        let newRate = direction < 0 ? lfoState.rate * step : lfoState.rate / step;
        lfoState.rate = Math.max(0.1, Math.min(20, newRate));
        syncAudioParamsFromState();
    } else if (target.id === domCache.vcfControl.id) {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 2 : 10;
        let currentY = parseFloat(domCache.vcfControl.getAttribute('y'));
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
        if (!state.audio.sustainActivado && !state.audio.tecladoNotaActiva) triggerRelease();
        return;
    }

    const midiNote = KEY_TO_MIDI_MAP[e.code];
    if (midiNote && !e.repeat) {
        if (!state.audio.isInitialized) {
            initializeAudio();
            syncAudioParamsFromState();
        }
        const freq = midiToFreq(midiNote);
        const now = state.audio.audioContext.currentTime;
        const { vco1, vco2 } = state.audio.nodes;
        if (vco1) vco1.frequency.linearRampToValueAtTime(freq, now, SHORT_AUDIO_RAMP_TIME);
        if (vco2 && state.audio.nodes.ringModWet.gain.value < 0.01) {
            if (state.synth.vco2.tuningMode === 'relative') {
                vco2.frequency.linearRampToValueAtTime(freq, now, SHORT_AUDIO_RAMP_TIME);
            } else {
                const detuneHz = vco2.frequency.value - vco1.frequency.value;
                vco2.frequency.linearRampToValueAtTime(freq + detuneHz, now, SHORT_AUDIO_RAMP_TIME);
            }
        }
        if (!state.audio.tecladoNotaActiva) triggerAttack();
        state.audio.tecladoNotaActiva = e.code;
        state.audio.tecladoGlow = true;
        actualizarGlows();
    }
}

function handleKeyUp(e) {
    if (KEY_TO_MIDI_MAP[e.code] && e.code === state.audio.tecladoNotaActiva) {
        state.audio.tecladoNotaActiva = null;
        state.audio.tecladoGlow = false;
        if (!state.audio.sustainActivado) triggerRelease();
        actualizarGlows();
    }
}

// --- Funcións de Actualización da UI ---

function updateControl(type, newPos, currentPoint) {
    switch (type) {
        case 'vco1': case 'vco2': updateVCO(newPos.x, newPos.y, currentPoint); break;
        case 'lfo1': case 'lfo2': updateLFO(newPos.x, newPos.y); break;
        case 'ring-mod': updateRingMod(newPos.x, newPos.y); break;
        case 'vcf': updateVCF(newPos.x, newPos.y); break;
        case 'adsr': updateADSR(state.ui.dragContext.target.id, newPos.x, newPos.y); break;
        case 'delay': updateDelay(newPos.x, newPos.y); break;
        case 'tempo': updateTempo(newPos.x); break;
    }
    syncAudioParamsFromState(); // Sincronizar audio despois de cada cambio na UI
}

function updateVCO(x, y, currentPoint) {
    const { vco } = DRAG_LIMITS;
    const clampedX = Math.max(vco.xMin, Math.min(vco.xMax, x));
    const clampedY = Math.max(vco.yMin, Math.min(vco.yMax, y));
    state.ui.domCache.vcoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.vco = { x: clampedX, y: clampedY };

    const absoluteX = 400 + clampedX;
    const absoluteY = 180 + clampedY;
    const { domCache } = state.ui;
    const hue = mapearRango(absoluteY, 40, 320, 240, 0);
    const radius = mapearRango(absoluteX, 40, 760, 20, 60);
    domCache.vco1Circle.setAttribute('fill', `hsl(${hue}, 90%, 55%)`);
    domCache.vco1Circle.setAttribute('r', radius);
    domCache.vco2Circle.setAttribute('fill', `hsl(${hue}, 80%, 30%)`);

    const centroAbsolutoVCO = { x: 400 + clampedX, y: 180 + clampedY };
    const relativeX = currentPoint.x - centroAbsolutoVCO.x;
    const relativeY = currentPoint.y - centroAbsolutoVCO.y;
    const mix = mapearRango(relativeY, 70, -70, 0, 1);
    domCache.vco2Circle.setAttribute('fill-opacity', mix);

    actualizarGlows();
    actualizarLineasModulacion();
}

function updateLFO(x, y) {
    const { lfo } = DRAG_LIMITS;
    const clampedX = Math.max(lfo.xMin, Math.min(lfo.xMax, x));
    const clampedY = Math.max(lfo.yMin, Math.min(lfo.yMax, y));
    state.ui.domCache.lfoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.lfo = { x: clampedX, y: clampedY };

    const absX = 100 + clampedX;
    const absY = 100 + clampedY;
    const normalizedPosition = mapearRango(absX, 0, 800, 0, 1);
    state.synth.lfo1.rate = 0.1 * Math.pow(20 / 0.1, normalizedPosition);
    const depth = mapearRango(absY, 350, 0, 0, 1);
    state.synth.lfo1.depth = depth;
    state.synth.lfo2.depth = depth;

    actualizarLineasModulacion();
}

function updateRingMod(x, y) {
    const { ringMod } = DRAG_LIMITS;
    const clampedX = Math.max(ringMod.xMin, Math.min(ringMod.xMax, x));
    const clampedY = Math.max(ringMod.yMin, Math.min(ringMod.yMax, y));
    state.ui.domCache.ringModGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    state.ui.positions.ringMod = { x: clampedX, y: clampedY };
}

function updateVCF(x, y) {
    const { vcfControl, vcfJack } = state.ui.domCache;
    const vcfW = parseFloat(vcfControl.getAttribute('width'));
    const clampedX = Math.max(0, Math.min(800 - vcfW, x));
    const { yMin, yMax } = DRAG_LIMITS.vcf;
    const clampedY = Math.max(yMin, Math.min(yMax, y));
    const newHeight = Math.max(1, yMax - clampedY);

    vcfControl.setAttribute('x', clampedX);
    vcfControl.setAttribute('y', clampedY);
    vcfControl.setAttribute('height', newHeight);
    vcfJack.setAttribute('cx', clampedX + (vcfW / 2));
    vcfJack.setAttribute('cy', clampedY);
    state.ui.positions.vcf = { x: clampedX, y: clampedY };
    actualizarLineasModulacion();
}

function updateADSR(handleId, x, y) {
    const { domCache, positions } = state.ui;
    const { adsr } = state.synth;
    const { adsrAttack, adsrDecaySustain, adsrRelease, adsrShape } = domCache;
    const { yMin, yMax } = DRAG_LIMITS.adsr;
    const startX = 50;

    if (handleId) {
        // Se o usuario está arrastrando, actualiza a posición do manexador
        const currentAttackX = parseFloat(adsrAttack.getAttribute('cx')) || startX;
        const currentDecaySustainX = parseFloat(adsrDecaySustain.getAttribute('cx')) || currentAttackX + 10;

        if (handleId === adsrAttack.id) {
            adsrAttack.setAttribute('cx', Math.max(startX, x));
        } else if (handleId === adsrDecaySustain.id) {
            adsrDecaySustain.setAttribute('cx', Math.max(currentAttackX + 10, x));
            adsrDecaySustain.setAttribute('cy', Math.max(yMin, Math.min(yMax, y)));
        } else if (handleId === adsrRelease.id) {
            adsrRelease.setAttribute('cx', Math.max(currentDecaySustainX + 10, x));
        }
    }

    // Ler sempre os valores do DOM despois de calquera posible actualización
    const attackX = parseFloat(adsrAttack.getAttribute('cx'));
    const decaySustainX = parseFloat(adsrDecaySustain.getAttribute('cx'));
    const decaySustainY = parseFloat(adsrDecaySustain.getAttribute('cy'));
    const releaseX = parseFloat(adsrRelease.getAttribute('cx'));

    // Actualizar o estado de forma segura, asegurándose de que todos os valores son números
    if ([attackX, decaySustainX, decaySustainY, releaseX].every(isFinite)) {
        adsr.attack = mapearRango(attackX - startX, 1, 150, 0.01, 2.0);
        adsr.decay = mapearRango(decaySustainX - attackX, 10, 150, 0.01, 2.0);
        adsr.sustain = mapearRango(decaySustainY, yMax, yMin, 0.0, 1.0);
        adsr.release = mapearRango(releaseX - decaySustainX, 10, 150, 0.01, 5.0);

        // Actualizar a forma visual do ADSR
        const p1 = `${startX},${yMax}`, p2 = `${attackX},${yMin}`, p3 = `${decaySustainX},${decaySustainY}`, p4 = `${releaseX},${yMax}`;
        adsrShape.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`);

        // Gardar as posicións para futuras referencias
        positions.adsr = {
            attack: { cx: attackX },
            decaySustain: { cx: decaySustainX, cy: decaySustainY },
            release: { cx: releaseX }
        };
    }
}

function updateDelay(x, y) {
    const { domCache } = state.ui;
    const { delay } = DRAG_LIMITS;
    const clampedX = Math.max(delay.xMin, Math.min(delay.xMax, x));
    const clampedY = Math.max(delay.yMin, Math.min(delay.yMax, y));
    domCache.delayHandle.setAttribute('cx', clampedX);
    domCache.delayHandle.setAttribute('cy', clampedY);
    state.ui.positions.delay = { cx: clampedX, cy: clampedY };
}

function updateTempo(x) {
    const { domCache } = state.ui;
    const { tempo } = DRAG_LIMITS;
    const clampedX = Math.max(tempo.xMin, Math.min(tempo.xMax, x));
    domCache.tempoHandle.setAttribute('cx', clampedX);
    state.ui.positions.tempo.cx = clampedX;

    const newTempo = Math.round(mapearRango(clampedX, tempo.xMin, tempo.xMax, 60, 240));
    state.sequencer.tempo = newTempo;
    domCache.tempoDisplay.textContent = `${newTempo} bpm`;

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
    if (!state.audio.isInitialized) return;
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
    requestAnimationFrame(animarLFOs);
    if (!state.audio.isInitialized) return;
    const agora = Date.now() / 1000;
    const { domCache } = state.ui;
    if (state.synth.lfo1) {
        const angulo1 = (agora * state.synth.lfo1.rate * 360) % 360;
        domCache.lfo1Indicator.setAttribute('transform', `rotate(${angulo1}, 100, 100)`);
    }
    if (state.synth.lfo2) {
        const angulo2 = (agora * state.synth.lfo2.rate * 360) % 360;
        domCache.lfo2Indicator.setAttribute('transform', `rotate(${angulo2}, 100, 100)`);
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

export function aplicarConfiguracion(settings) {
    try {
        if (!settings || !settings.positions || !settings.states) {
            console.error("O ficheiro de configuración é inválido.");
            return;
        }
        resetAudioEngine();

        Object.assign(state.synth.vco1, settings.states.vco1);
        Object.assign(state.synth.vco2, settings.states.vco2);
        Object.assign(state.synth.lfo1, settings.states.lfo1);
        Object.assign(state.synth.lfo2, settings.states.lfo2);
        if (settings.states.adsr) { // Comprobación de seguridade para presets antigos
            Object.assign(state.synth.adsr, settings.states.adsr);
        }
        Object.assign(state.sequencer, settings.states.sequencer);
        state.sequencer.data = settings.states.sequencerData;

        const { positions } = settings;
        updateVCO(positions.vco.x, positions.vco.y, { x: 0, y: 0 });
        updateLFO(positions.lfo.x, positions.lfo.y);
        if (positions.ringMod) updateRingMod(positions.ringMod.x, positions.ringMod.y);
        updateVCF(positions.vcf.x, positions.vcf.y);

        // Sincronizar a UI do ADSR a partir do estado
        updateADSR();

        updateDelay(positions.delay.cx, positions.delay.cy);
        updateTempo(positions.tempo.cx);

        cambiarFormaDeOnda(1, true);
        cambiarFormaDeOnda(2, true);
        cambiarDestinoLFO(1, true);
        cambiarDestinoLFO(2, true);
        reloadSequencerUI();

        syncAudioParamsFromState(); // Sincronizar o audio co novo estado cargado

        console.log("Configuración aplicada con éxito.");
    } catch (error) {
        console.error("🛑 ERROR CRÍTICO ao aplicar a configuración:", error);
    }
}

function cambiarFormaDeOnda(numVCO, isInitial = false) {
    const vcoState = (numVCO === 1) ? state.synth.vco1 : state.synth.vco2;
    if (!isInitial) {
        vcoState.ondaActual = (vcoState.ondaActual + 1) % vcoState.waveforms.length;
    }
    if (state.audio.isInitialized) {
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
        } else if (numVCO === 2) {
            state.audio.nodes.vco2.type = novaOnda;
        }
    }
    document.querySelectorAll(`.onda-vco${numVCO}`).forEach(el => { el.style.display = 'none' });
    const iconToShow = document.getElementById(`vco${numVCO}-onda-${vcoState.waveforms[vcoState.ondaActual]}`);
    if (iconToShow) iconToShow.style.display = 'block';
}

function cambiarDestinoLFO(numLFO, isInitial = false) {
    const lfoState = (numLFO === 1) ? state.synth.lfo1 : state.synth.lfo2;
    if (!isInitial) {
        lfoState.targetIndex = (lfoState.targetIndex + 1) % lfoState.targets.length;
    }
    if (state.audio.isInitialized) {
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
    }
    actualizarLineasModulacion();
    syncAudioParamsFromState();
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
    updateVCO(state.ui.positions.vco.x, state.ui.positions.vco.y, { x: 0, y: 0 });
    syncAudioParamsFromState();
}

function actualizarLineasModulacion() {
    if (!state.ui.domCache.lfoGroup || !state.ui.domCache.vcoGroup) return;
    const { domCache } = state.ui;
    [1, 2].forEach(numLFO => {
        const line = (numLFO === 1) ? domCache.lfo1ModLine : domCache.lfo2ModLine;
        if (!line) return;
        const lfoState = (numLFO === 1) ? state.synth.lfo1 : state.synth.lfo2;
        const targetKey = lfoState.targets[lfoState.targetIndex];
        if (targetKey === 'OFF') {
            line.style.display = 'none';
            return;
        }
        const lfoMatrix = domCache.lfoGroup.transform.baseVal.getItem(0).matrix;
        line.setAttribute('x1', lfoMatrix.e + 100);
        line.setAttribute('y1', lfoMatrix.f + 100);
        let targetX, targetY, targetColor;
        const { vcoGroup, vco1Circle, vco2Circle, vcfJack, vcfControl } = domCache;
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
    initializeSequencer(); // Call initializeSequencer BEFORE aplicarConfiguracion
    aplicarConfiguracion({ positions: state.ui.positions, states: { ...state.synth, sequencer: state.sequencer, sequencerData: state.sequencer.data } });
    animarLFOs();
}