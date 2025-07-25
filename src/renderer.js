// Ficheiro: src/renderer.js (VERSIÓN FINAL, COMPLETA E VERIFICADA)

// --- 1. REFERENCIAS Á GUI ---
const lenzo = document.getElementById('lenzo-sintetizador');
const vcoGroup = document.getElementById('vco-group');
const vco1Circle = document.getElementById('vco1-circle');
const vco2Circle = document.getElementById('vco2-circle');
const vcfControl = document.getElementById('vcf');
const vcfJack = document.getElementById('vcf-jack');
const adsrGroupElements = {
    attack: document.getElementById('attack-handle'),
    decaySustain: document.getElementById('decay-sustain-handle'),
    release: document.getElementById('release-handle'),
};
const lfoGroup = document.getElementById('lfo-group');
const lfo1Indicator = document.getElementById('lfo1-indicator');
const lfo2Indicator = document.getElementById('lfo2-indicator');
const lfo1ModLine = document.getElementById('lfo1-mod-line');
const lfo2ModLine = document.getElementById('lfo2-mod-line');
const adsrShape = document.getElementById('adsr-shape');
const delayHandle = document.getElementById('delay-handle');
const sequencerGrid = document.getElementById('sequencer-grid');
const playButton = document.getElementById('play-button');
const playIcon = document.getElementById('play-icon');
const stopIcon = document.getElementById('stop-icon');
const tempoHandle = document.getElementById('tempo-handle');
const tempoDisplay = document.getElementById('tempo-display');
const playhead = document.getElementById('playhead');
const saveButton = document.getElementById('save-button');
const loadButton = document.getElementById('load-button');

// --- 2. ESTADO DO SINTETIZADOR ---
let audioContext;
let vco1, vco2, vcf, vca, noiseGenerator, lfo1Node, lfo2Node;
let vco2Gain, masterGain, lfo1Depth, lfo2Depth;
let delayNode, feedbackNode, dryGain, wetGain;
let notaActiva = false;
let dragContext = {};
let sustainActivado = false; 
let vco2TuningMode = 'relative';

// Obxecto de estado explícito para as posicións dos elementos principais
let positionState = {
    vco: { x: 0, y: 0 },
    lfo: { x: 0, y: 0 }
};

const formasDeOndaVCO1 = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
const formasDeOndaVCO2 = ['sine', 'square', 'triangle', 'sawtooth'];
let vco1State = { ondaActual: 0 };
let vco2State = { ondaActual: 0 };

const lfo1Targets = { 'OFF': [], 'VCO1 Freq': ['vco1_freq'], 'VCF Freq': ['vcf_freq'] };
const lfo2Targets = { 'OFF': [], 'VCO2 Detune': ['vco2_detune'], 'VCF Q': ['vcf_q'] };
let lfo1State = { rate: 2, depth: 0, targetIndex: 0, targets: Object.keys(lfo1Targets) };
let lfo2State = { rate: 0.5, depth: 0, targetIndex: 0, targets: Object.keys(lfo2Targets) };

let adsr = { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.3 };

let sequencerState = {
    isPlaying: false,
    currentStep: 0,
    tempo: 120,
    clockInterval: null,
    steps: 16,
    notes: 12
};
let sequencerData = [];

if (vcoGroup.transform.baseVal.numberOfItems === 0) vcoGroup.transform.baseVal.appendItem(lenzo.createSVGTransform());
if (lfoGroup.transform.baseVal.numberOfItems === 0) lfoGroup.transform.baseVal.appendItem(lenzo.createSVGTransform());

// --- 3. MOTOR DE AUDIO ---
function inicializarAudio() {
    if (audioContext) {
        if (audioContext.state === 'suspended') audioContext.resume();
        return;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    vco1 = audioContext.createOscillator();
    vco2 = audioContext.createOscillator();
    vco2Gain = audioContext.createGain();
    vcf = audioContext.createBiquadFilter();
    vca = audioContext.createGain();
    masterGain = audioContext.createGain();
    noiseGenerator = audioContext.createBufferSource();
    noiseGenerator.buffer = createWhiteNoiseBuffer(audioContext);
    noiseGenerator.loop = true;
    lfo1Node = audioContext.createOscillator();
    lfo1Depth = audioContext.createGain();
    lfo2Node = audioContext.createOscillator();
    lfo2Depth = audioContext.createGain();
    delayNode = audioContext.createDelay(2.0);
    feedbackNode = audioContext.createGain();
    dryGain = audioContext.createGain();
    wetGain = audioContext.createGain();

    vco2.connect(vco2Gain).connect(vcf);
    vcf.connect(vca).connect(masterGain);
    masterGain.connect(dryGain).connect(audioContext.destination);
    masterGain.connect(delayNode);
    delayNode.connect(feedbackNode).connect(delayNode);
    delayNode.connect(wetGain).connect(audioContext.destination);
    
    lfo1Node.connect(lfo1Depth);
    lfo2Node.connect(lfo2Depth);

    vco1.type = formasDeOndaVCO1[vco1State.ondaActual];
    vco2.type = formasDeOndaVCO2[vco2State.ondaActual];
    vco2.detune.value = 0;
    vco2Gain.gain.value = 0.5;
    vcf.type = 'lowpass';
    vca.gain.value = 0;
    masterGain.gain.value = 0.5;
    dryGain.gain.value = 1.0;
    wetGain.gain.value = 0.0;
    delayNode.delayTime.value = 0.3;
    feedbackNode.gain.value = 0.4;
    lfo1Node.type = 'sine';
    lfo2Node.type = 'triangle';
    lfo1Depth.gain.value = 0;
    lfo2Depth.gain.value = 0;
    
    vco1.start();
    vco2.start();
    lfo1Node.start();
    lfo2Node.start();
    noiseGenerator.start();
    
    cambiarFormaDeOnda(1, true);
    cambiarFormaDeOnda(2, true);
    cambiarDestinoLFO(1, true);
    cambiarDestinoLFO(2, true);
    animarLFOs();
}

// --- 4. XESTORES DE EVENTOS ---
lenzo.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!audioContext) inicializarAudio();
    
    const target = e.target.closest('[data-draggable]');
    if (!target) return;
    
    e.preventDefault();
    const startPoint = getSvgCoordinates(e.clientX, e.clientY);
    const type = target.dataset.draggable;
    dragContext = { target, type, startPoint };

    if (type.startsWith('vco')) {
        dragContext.initialPos = { x: positionState.vco.x, y: positionState.vco.y };
    } else if (type.startsWith('lfo')) {
        dragContext.initialPos = { x: positionState.lfo.x, y: positionState.lfo.y };
    } else {
        dragContext.initialPos = {
            x: parseFloat(target.getAttribute('x')) || parseFloat(target.getAttribute('cx')),
            y: parseFloat(target.getAttribute('y')) || parseFloat(target.getAttribute('cy'))
        };
    }

    if (type.startsWith('vco') && !notaActiva) {
        notaActiva = true;
        sustainActivado = false;
        restaurarEstiloVCO(); 
        const now = audioContext.currentTime;
        vca.gain.cancelScheduledValues(now);
        vca.gain.setValueAtTime(vca.gain.value, now);
        vca.gain.linearRampToValueAtTime(1.0, now + adsr.attack);
        vca.gain.linearRampToValueAtTime(adsr.sustain, now + adsr.attack + adsr.decay);
    }
});

window.addEventListener('mousemove', (e) => {
    if (!dragContext.target) return;
    e.preventDefault();
    const currentPoint = getSvgCoordinates(e.clientX, e.clientY);
    const delta = {
        x: currentPoint.x - dragContext.startPoint.x,
        y: currentPoint.y - dragContext.startPoint.y
    };
    const newPos = {
        x: dragContext.initialPos.x + delta.x,
        y: dragContext.initialPos.y + delta.y
    };

    switch (dragContext.type) {
        case 'vco1':
        case 'vco2':
            actualizarVCO1(newPos.x, newPos.y);
            const centroAbsolutoVCO = { x: 400 + positionState.vco.x, y: 180 + positionState.vco.y };
            actualizarVCO2(currentPoint.x - centroAbsolutoVCO.x, currentPoint.y - centroAbsolutoVCO.y);
            break;
        case 'lfo1':
        case 'lfo2':
            actualizarLFO1(newPos.x, newPos.y);
            const centroAbsolutoLFO = { x: 100 + positionState.lfo.x, y: 100 + positionState.lfo.y };
            actualizarLFO2(currentPoint.x - centroAbsolutoLFO.x, currentPoint.y - centroAbsolutoLFO.y);
            break;
        case 'vcf':
            actualizarVCF(newPos.x, newPos.y);
            break;
        case 'adsr':
            actualizarADSR(dragContext.target.id, newPos.x, newPos.y);
            break;
        case 'delay':
            actualizarDelay(newPos.x, newPos.y);
            break;
        case 'tempo':
            actualizarTempo(newPos.x);
            break;
    }
});

window.addEventListener('mouseup', () => {
    if (dragContext.target && dragContext.type.startsWith('vco') && !sustainActivado) {
        notaActiva = false;
        const now = audioContext.currentTime;
        vca.gain.cancelScheduledValues(now);
        vca.gain.setValueAtTime(vca.gain.value, now);
        vca.gain.linearRampToValueAtTime(0, now + adsr.release);
    }
    dragContext = {};
});

window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !notaActiva) return;
    e.preventDefault(); 
    sustainActivado = !sustainActivado;
    if (sustainActivado) {
        vco1Circle.setAttribute('stroke', '#80deea');
        vco1Circle.setAttribute('stroke-width', '4');
    } else {
        notaActiva = false;
        const now = audioContext.currentTime;
        vca.gain.cancelScheduledValues(now);
        vca.gain.setValueAtTime(vca.gain.value, now);
        vca.gain.linearRampToValueAtTime(0, now + adsr.release);
        actualizarGlows(false, false);
    }
});

lenzo.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!audioContext) inicializarAudio();
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
});

lenzo.addEventListener('wheel', (e) => {
    if (!audioContext) return;
    const target = e.target;
    let feedback = false;

    if (target.id === 'vco2-circle') {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 1 : 10;
        let currentDetune = vco2.detune.value;
        let newDetune = currentDetune - (direction * step);
        newDetune = Math.max(-1200, Math.min(1200, newDetune));
        vco2.detune.setTargetAtTime(newDetune, audioContext.currentTime, 0.01);
        const roundedDetune = Math.round(newDetune);
        actualizarGlows(roundedDetune === 0, Math.abs(roundedDetune) === 700);
    }
    if (target.id === 'lfo2-circle' || target.id === 'lfo1-circle') {
        e.preventDefault();
        feedback = true;
        const lfoState = target.id === 'lfo1-circle' ? lfo1State : lfo2State;
        const lfoNode = target.id === 'lfo1-circle' ? lfo1Node : lfo2Node;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 0.05 : 0.5;
        let newRate = lfoState.rate - (direction * step);
        newRate = Math.max(0.1, Math.min(20, newRate));
        lfoState.rate = newRate;
        if(lfoNode) lfoNode.frequency.setTargetAtTime(newRate, audioContext.currentTime, 0.01);
    }
    if (target.id === 'vcf') {
        e.preventDefault();
        feedback = true;
        const direction = Math.sign(e.deltaY);
        const step = e.shiftKey ? 2 : 10;
        let currentY = parseFloat(vcfControl.getAttribute('y'));
        let newY = currentY + (direction * step);
        newY = Math.max(80, Math.min(260, newY));
        actualizarVCF(parseFloat(vcfControl.getAttribute('x')), newY);
    }

    if (feedback) {
        mostrarFeedbackRoda();
    }
});

playButton.addEventListener('click', startStopSequencer);

// --- 5. FUNCIÓNS DE CONTROL ---
function mostrarFeedbackRoda() {
    document.body.style.transition = 'background-color 0.05s ease-in-out';
    document.body.style.backgroundColor = '#333';
    setTimeout(() => {
        document.body.style.backgroundColor = ''; 
    }, 100);
}

function restaurarEstiloVCO() {
    vco1Circle.setAttribute('fill', '#00bcd4');
    vco1Circle.setAttribute('r', 40);
    vco2Circle.setAttribute('fill', '#00838f');
    vco2Circle.setAttribute('fill-opacity', '1');
    actualizarGlows(false, false);
}

function cambiarFormaDeOnda(numVCO, isInitial = false) {
    const state = (numVCO === 1) ? vco1State : vco2State;
    const formas = (numVCO === 1) ? formasDeOndaVCO1 : formasDeOndaVCO2;
    if (!isInitial) {
        state.ondaActual = (state.ondaActual + 1) % formas.length;
    }
    const novaOnda = formas[state.ondaActual];
    if (numVCO === 1) {
        vco1.disconnect();
        if (noiseGenerator.numberOfOutputs > 0) noiseGenerator.disconnect();
        if (novaOnda === 'noise') {
            noiseGenerator.connect(vcf);
        } else {
            vco1.type = novaOnda;
            vco1.connect(vcf);
        }
    } else if (numVCO === 2 && vco2) {
        vco2.type = novaOnda;
    }
    document.querySelectorAll(`.onda-vco${numVCO}`).forEach(el => { el.style.display = 'none' });
    const iconToShow = document.getElementById(`vco${numVCO}-onda-${novaOnda}`);
    if (iconToShow) iconToShow.style.display = 'block';
}

function cambiarDestinoLFO(numLFO, isInitial = false) {
    const state = (numLFO === 1) ? lfo1State : lfo2State;
    if (!isInitial) {
        state.targetIndex = (state.targetIndex + 1) % state.targets.length;
    }
    const depthNode = (numLFO === 1) ? lfo1Depth : lfo2Depth;
    if(depthNode) depthNode.disconnect();
    const targetKey = state.targets[state.targetIndex];
    const connections = (numLFO === 1) ? lfo1Targets[targetKey] : lfo2Targets[targetKey];
    connections.forEach(dest => {
        if(!depthNode) return;
        switch(dest) {
            case 'vco1_freq': if(vco1) depthNode.connect(vco1.frequency); break;
            case 'vco2_detune': if(vco2) depthNode.connect(vco2.detune); break;
            case 'vcf_freq': if(vcf) depthNode.connect(vcf.frequency); break;
            case 'vcf_q': if(vcf) depthNode.connect(vcf.Q); break;
        }
    });
    actualizarLineasModulacion();
}

function cambiarModoAfinacionVCO2() {
    const vco2WaveIcons = document.getElementById('vco2-wave-icons');
    if (vco2TuningMode === 'relative') {
        vco2TuningMode = 'fixed';
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
        vco2TuningMode = 'relative';
        const plusIndicator = document.getElementById('vco2-fixed-indicator');
        if (plusIndicator) plusIndicator.remove();
    }
    actualizarVCO2(0, 0); 
}

function inicializarSequencer() {
    sequencerData = Array(sequencerState.steps).fill(null).map(() => Array(sequencerState.notes).fill(false));
    
    const gridRect = document.querySelector("#sequencer rect");
    const cellWidth = parseFloat(gridRect.getAttribute('width')) / sequencerState.steps;
    const cellHeight = (parseFloat(gridRect.getAttribute('height')) - 30) / sequencerState.notes;
    const startX = parseFloat(gridRect.getAttribute('x'));
    const startY = parseFloat(gridRect.getAttribute('y')) + 30;

    for (let step = 0; step < sequencerState.steps; step++) {
        for (let note = 0; note < sequencerState.notes; note++) {
            const x = startX + step * cellWidth;
            const y = startY + note * cellHeight;
            
            const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            cell.setAttribute('class', 'sequencer-cell');
            cell.setAttribute('x', x);
            cell.setAttribute('y', y);
            cell.setAttribute('width', cellWidth);
            cell.setAttribute('height', cellHeight);
            cell.dataset.step = step;
            cell.dataset.note = sequencerState.notes - 1 - note;

            cell.addEventListener('click', () => {
                const isActive = sequencerData[step][cell.dataset.note];
                sequencerData[step][cell.dataset.note] = !isActive;
                cell.classList.toggle('sequencer-cell-active', !isActive);
            });
            sequencerGrid.appendChild(cell);
        }
    }
}

function startStopSequencer() {
    sequencerState.isPlaying = !sequencerState.isPlaying;
    if (sequencerState.isPlaying) {
        if (!audioContext) inicializarAudio();
        sequencerState.currentStep = 0;
        playIcon.style.display = 'none';
        stopIcon.style.display = 'block';
        playhead.style.display = 'block';
        const intervalTime = 60000 / sequencerState.tempo / 4;
        sequencerState.clockInterval = setInterval(tick, intervalTime);
    } else {
        playIcon.style.display = 'block';
        stopIcon.style.display = 'none';
        playhead.style.display = 'none';
        clearInterval(sequencerState.clockInterval);
        sequencerState.clockInterval = null;
    }
}

function tick() {
    const step = sequencerState.currentStep;
    const notesToPlay = [];
    for (let note = 0; note < sequencerState.notes; note++) {
        if (sequencerData[step][note]) {
            notesToPlay.push(60 + note);
        }
    }

    if (notesToPlay.length > 0) {
        triggerSequencerNote(notesToPlay);
    }

    const gridRect = document.querySelector("#sequencer rect");
    const cellWidth = parseFloat(gridRect.getAttribute('width')) / sequencerState.steps;
    const startX = parseFloat(gridRect.getAttribute('x'));
    const playheadYStart = parseFloat(gridRect.getAttribute('y')) + 30;
    const playheadYEnd = playheadYStart + parseFloat(gridRect.getAttribute('height')) - 30;
    const playheadX = startX + (step * cellWidth);
    playhead.setAttribute('x1', playheadX);
    playhead.setAttribute('x2', playheadX);
    playhead.setAttribute('y1', playheadYStart);
    playhead.setAttribute('y2', playheadYEnd);

    sequencerState.currentStep = (step + 1) % sequencerState.steps;
}

// --- FUNCIÓN CORRIXIDA ---
function triggerSequencerNote(midiNotes) {
    const now = audioContext.currentTime;
    const noteDuration = (60 / sequencerState.tempo / 4) * 0.9;
    
    // Comproba se a onda activa do VCO1 é ruído
    const isNoiseActive = formasDeOndaVCO1[vco1State.ondaActual] === 'noise';

    if (!isNoiseActive) {
        const freq = midiToFreq(midiNotes[0]);
        vco1.frequency.setValueAtTime(freq, now);
        if(vco2TuningMode === 'relative') {
            vco2.frequency.setValueAtTime(freq, now);
        } else {
            const detuneHz = vco2.frequency.value - vco1.frequency.value;
            vco2.frequency.setValueAtTime(freq + detuneHz, now);
        }
    }
    // Se é ruído, non facemos nada coa frecuencia, simplemente disparamos a envolvente

    // Dispara a envolvente
    vca.gain.cancelScheduledValues(now);
    vca.gain.setValueAtTime(0, now);
    vca.gain.linearRampToValueAtTime(1.0, now + adsr.attack);
    vca.gain.linearRampToValueAtTime(adsr.sustain, now + adsr.attack + adsr.decay);
    vca.gain.setTargetAtTime(0, now + noteDuration - adsr.release, 0.01);
}

// --- 6. FUNCIÓNS DE ACTUALIZACIÓN ---
function actualizarValoresSintetizador() {
    actualizarVCO1(0, 0);
    actualizarVCO2(0, 0);
    actualizarLFO1(0, 0);
    actualizarLFO2(0, 0);
    actualizarVCF(720, 80);
    actualizarADSR(null);
    actualizarDelay(580, 530);
    actualizarTempo(235);
    actualizarLineasModulacion();
}

function actualizarVCO1(x, y) {
    const clampedX = Math.max(-360, Math.min(360, x));
    const clampedY = Math.max(-140, Math.min(140, y));
    vcoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    
    // Actualiza o estado da posición
    positionState.vco.x = clampedX;
    positionState.vco.y = clampedY;

    const absoluteX = 400 + clampedX;
    const absoluteY = 180 + clampedY;
    const notaMIDI = mapearRango(absoluteY, 320, 40, 24, 96);
    const freq = midiToFreq(notaMIDI);
    const volume = mapearRango(absoluteX, 40, 760, 0, 0.7);

    if (vco1) vco1.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
    if (masterGain) masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, 0.02);

    if (vco2) {
        if (vco2TuningMode === 'relative') {
            vco2.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
        } else {
            const currentDetuneHz = vco2.frequency.value - vco1.frequency.value;
            vco2.frequency.setTargetAtTime(freq + currentDetuneHz, audioContext.currentTime, 0.01);
        }
    }
    
    const hue = mapearRango(absoluteY, 40, 320, 240, 0);
    const radius = mapearRango(absoluteX, 40, 760, 20, 60);
    vco1Circle.setAttribute('fill', `hsl(${hue}, 90%, 55%)`);
    vco1Circle.setAttribute('r', radius);
    vco2Circle.setAttribute('fill', `hsl(${hue}, 80%, 30%)`);
    actualizarLineasModulacion();
}

function actualizarVCO2(relativeX, relativeY) {
    const mix = mapearRango(relativeY, 70, -70, 0, 1, false);
    if (vco2Gain) vco2Gain.gain.setTargetAtTime(mix, audioContext.currentTime, 0.02);
    vco2Circle.setAttribute('fill-opacity', mix);

    if (vco2TuningMode === 'relative') {
        const maxDetuneCents = 1200;
        const fifthDetuneCents = 700;
        const controlRangeX = 70;
        const snapThreshold = 4; 
        const fifthXPosition = (fifthDetuneCents / maxDetuneCents) * controlRangeX;

        if (Math.abs(relativeX) < snapThreshold) relativeX = 0;
        else if (Math.abs(relativeX - fifthXPosition) < snapThreshold) relativeX = fifthXPosition;
        else if (Math.abs(relativeX + fifthXPosition) < snapThreshold) relativeX = -fifthXPosition;

        const detune = mapearRango(relativeX, -controlRangeX, controlRangeX, -maxDetuneCents, maxDetuneCents, false);
        if (vco2) {
            vco2.detune.setTargetAtTime(detune, audioContext.currentTime, 0.02);
            if (vco1) vco2.frequency.setTargetAtTime(vco1.frequency.value, audioContext.currentTime, 0.01);
        }
        const roundedDetune = Math.round(detune);
        actualizarGlows(roundedDetune === 0, Math.abs(roundedDetune) === fifthDetuneCents);
    } else {
        const maxDetuneHz = 50;
        const detuneHz = mapearRango(relativeX, -70, 70, -maxDetuneHz, maxDetuneHz, false);
        if (vco1 && vco2) {
            vco2.frequency.setTargetAtTime(vco1.frequency.value + detuneHz, audioContext.currentTime, 0.02);
            vco2.detune.setTargetAtTime(0, audioContext.currentTime, 0.01); 
        }
        actualizarGlows(false, false);
    }
}

function actualizarLFO1(x, y) {
    const clampedX = Math.max(-100, Math.min(700, x));
    const clampedY = Math.max(-100, Math.min(250, y));
    lfoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
    
    // Actualiza o estado da posición
    positionState.lfo.x = clampedX;
    positionState.lfo.y = clampedY;

    const absX = 100 + clampedX;
    const absY = 100 + clampedY;
    lfo1State.rate = mapearRango(absX, 0, 800, 0.1, 20);
    lfo1State.depth = mapearRango(absY, 350, 0, 0, 1);
    
    if (lfo1Node) lfo1Node.frequency.setTargetAtTime(lfo1State.rate, audioContext.currentTime, 0.01);
    if (lfo1Depth) lfo1Depth.gain.setTargetAtTime(lfo1State.depth * 2000, audioContext.currentTime, 0.01);
    actualizarLineasModulacion();
}

function actualizarLFO2(relativeX, relativeY) {
    lfo2State.rate = mapearRango(relativeX, -45, 45, 0.1, 20);
    lfo2State.depth = mapearRango(relativeY, 45, -45, 0, 1);

    if (lfo2Node) lfo2Node.frequency.setTargetAtTime(lfo2State.rate, audioContext.currentTime, 0.01);
    if (lfo2Depth) lfo2Depth.gain.setTargetAtTime(lfo2State.depth * 25, audioContext.currentTime, 0.01);
    actualizarLineasModulacion();
}

function actualizarLineasModulacion() {
    [1, 2].forEach(numLFO => {
        const line = (numLFO === 1) ? lfo1ModLine : lfo2ModLine;
        const state = (numLFO === 1) ? lfo1State : lfo2State;
        const targetKey = state.targets[state.targetIndex];
        if (targetKey === 'OFF') { line.style.display = 'none'; return; }

        const lfoMatrix = lfoGroup.transform.baseVal.getItem(0).matrix;
        line.setAttribute('x1', lfoMatrix.e + 100);
        line.setAttribute('y1', lfoMatrix.f + 100);

        let targetX, targetY;
        if (targetKey.includes('VCO')) {
            const vcoMatrix = vcoGroup.transform.baseVal.getItem(0).matrix;
            targetX = vcoMatrix.e + 400;
            targetY = vcoMatrix.f + 180;
        } else {
            targetX = parseFloat(vcfJack.getAttribute('cx'));
            targetY = parseFloat(vcfJack.getAttribute('cy'));
        }
        line.setAttribute('x2', targetX);
        line.setAttribute('y2', targetY);
        line.style.display = 'block';
    });
}

function actualizarVCF(x, y) {
    const vcfW = parseFloat(vcfControl.getAttribute('width'));
    const clampedX = Math.max(0, Math.min(800 - vcfW, x));
    const clampedY = Math.max(0, Math.min(400 - 20, y));
    const newHeight = Math.max(1, 400 - clampedY);

    vcfControl.setAttribute('x', clampedX);
    vcfControl.setAttribute('y', clampedY);
    vcfControl.setAttribute('height', newHeight);
    
    vcfJack.setAttribute('cx', clampedX + (vcfW / 2));
    vcfJack.setAttribute('cy', clampedY);

    const freq = Math.exp(mapearRango(clampedX, 0, 800 - vcfW, Math.log(20), Math.log(20000)));
    const q = mapearRango(newHeight, 1, 400, 0.1, 25);
    if (vcf) {
        vcf.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
        vcf.Q.setTargetAtTime(q, audioContext.currentTime, 0.01);
    }
    actualizarLineasModulacion();
}

function actualizarADSR(handleId, x, y) {
    const { attack, decaySustain, release } = adsrGroupElements;
    const yMin = 280, yMax = 380;
    
    if (handleId) {
        if (handleId === 'attack-handle') {
            attack.setAttribute('cx', Math.max(50, x));
        } else if (handleId === 'decay-sustain-handle') {
            decaySustain.setAttribute('cx', Math.max(parseFloat(attack.getAttribute('cx')) + 10, x));
            decaySustain.setAttribute('cy', Math.max(yMin, Math.min(yMax, y)));
        } else if (handleId === 'release-handle') {
            release.setAttribute('cx', Math.max(parseFloat(decaySustain.getAttribute('cx')) + 10, x));
        }
    }
    
    const startX = 50;
    const attackX = parseFloat(attack.getAttribute('cx'));
    const decaySustainX = parseFloat(decaySustain.getAttribute('cx'));
    const decaySustainY = parseFloat(decaySustain.getAttribute('cy'));
    const releaseX = parseFloat(release.getAttribute('cx'));
    
    adsr.attack = mapearRango(attackX - startX, 1, 150, 0.01, 2.0);
    adsr.decay = mapearRango(decaySustainX - attackX, 10, 150, 0.01, 2.0);
    adsr.sustain = mapearRango(decaySustainY, yMax, yMin, 0.0, 1.0);
    adsr.release = mapearRango(releaseX - decaySustainX, 10, 150, 0.01, 5.0);
    
    const p1 = `${startX},${yMax}`, p2 = `${attackX},${yMin}`;
    const p3 = `${decaySustainX},${decaySustainY}`, p4 = `${releaseX},${yMax}`;
    adsrShape.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`);
}

function actualizarDelay(x, y) {
    const xMin = 500, xMax = 660;
    const yMin = 300, yMax = 380;
    const clampedX = Math.max(xMin, Math.min(xMax, x));
    const clampedY = Math.max(yMin, Math.min(yMax, y));
    delayHandle.setAttribute('cx', clampedX);
    delayHandle.setAttribute('cy', clampedY);

    const delayTime = mapearRango(clampedX, xMin, xMax, 0.01, 2.0);
    const feedbackAmount = mapearRango(clampedY, yMax, yMin, 0, 0.9);
    const wetAmount = mapearRango(clampedY, yMax, yMin, 0, 0.7);

    if(delayNode) delayNode.delayTime.setTargetAtTime(delayTime, audioContext.currentTime, 0.01);
    if(feedbackNode) feedbackNode.gain.setTargetAtTime(feedbackAmount, audioContext.currentTime, 0.01);
    if(wetGain) wetGain.gain.setTargetAtTime(wetAmount, audioContext.currentTime, 0.01);
}

function actualizarTempo(x) {
    const xMin = 150, xMax = 280;
    const clampedX = Math.max(xMin, Math.min(xMax, x));
    tempoHandle.setAttribute('cx', clampedX);

    const newTempo = Math.round(mapearRango(clampedX, xMin, xMax, 60, 240));
    sequencerState.tempo = newTempo;
    tempoDisplay.textContent = `${newTempo} bpm`;

    if (sequencerState.isPlaying) {
        clearInterval(sequencerState.clockInterval);
        const intervalTime = 60000 / sequencerState.tempo / 4;
        sequencerState.clockInterval = setInterval(tick, intervalTime);
    }
}

// --- 7. GARDAR/CARGAR E ESTADO DE AUDIO ---

function resetAudioEngine() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    vca.gain.cancelScheduledValues(now);
    vca.gain.setValueAtTime(0, now);
    feedbackNode.gain.setTargetAtTime(0, now, 0.01);
    wetGain.gain.setTargetAtTime(0, now, 0.01);
    notaActiva = false;
    sustainActivado = false;
    actualizarGlows(false, false);
}

async function gardarConfiguracion() {
    const settings = {
        positions: {
            vcoGroup: positionState.vco,
            lfoGroup: positionState.lfo,
            vcf: { x: vcfControl.getAttribute('x'), y: vcfControl.getAttribute('y') },
            adsr: {
                attack: { cx: adsrGroupElements.attack.getAttribute('cx') },
                decaySustain: { cx: adsrGroupElements.decaySustain.getAttribute('cx'), cy: adsrGroupElements.decaySustain.getAttribute('cy') },
                release: { cx: adsrGroupElements.release.getAttribute('cx') }
            },
            delay: { cx: delayHandle.getAttribute('cx'), cy: delayHandle.getAttribute('cy') },
            tempo: { cx: tempoHandle.getAttribute('cx') }
        },
        states: {
            vco1: vco1State,
            vco2: vco2State,
            vco2TuningMode: vco2TuningMode,
            lfo1: lfo1State,
            lfo2: lfo2State,
            sequencer: sequencerState,
            sequencerData: sequencerData
        }
    };
    const result = await window.electronAPI.saveSettings(settings);
    if (result.success) {
        console.log(`Configuración gardada en: ${result.path}`);
    } else if (!result.cancelled) {
        console.error(`Error gardando a configuración: ${result.error}`);
    }
}

async function cargarConfiguracion() {
    const result = await window.electronAPI.loadSettings();
    if (result.success) {
        aplicarConfiguracion(result.data);
    } else if (!result.cancelled) {
        console.error(`Error cargando a configuración: ${result.error}`);
    }
}

function aplicarConfiguracion(settings) {
    try {
        if (!settings || !settings.positions || !settings.states) {
            console.error("O ficheiro de configuración é inválido ou está incompleto.");
            return;
        }
        
        resetAudioEngine();

        vco1State = settings.states.vco1;
        vco2State = settings.states.vco2;
        vco2TuningMode = settings.states.vco2TuningMode || 'relative';
        lfo1State = settings.states.lfo1;
        lfo2State = settings.states.lfo2;
        sequencerState = settings.states.sequencer;
        sequencerData = settings.states.sequencerData;

        const { positions } = settings;

        actualizarVCO1(positions.vcoGroup.x, positions.vcoGroup.y);
        actualizarLFO1(positions.lfoGroup.x, positions.lfoGroup.y);
        
        vcfControl.setAttribute('x', positions.vcf.x);
        vcfControl.setAttribute('y', positions.vcf.y);
        actualizarVCF(parseFloat(positions.vcf.x), parseFloat(positions.vcf.y));

        adsrGroupElements.attack.setAttribute('cx', positions.adsr.attack.cx);
        adsrGroupElements.decaySustain.setAttribute('cx', positions.adsr.decaySustain.cx);
        adsrGroupElements.decaySustain.setAttribute('cy', positions.adsr.decaySustain.cy);
        adsrGroupElements.release.setAttribute('cx', positions.adsr.release.cx);
        actualizarADSR(null);

        delayHandle.setAttribute('cx', positions.delay.cx);
        delayHandle.setAttribute('cy', positions.delay.cy);
        actualizarDelay(parseFloat(positions.delay.cx), parseFloat(positions.delay.cy));

        tempoHandle.setAttribute('cx', positions.tempo.cx);
        actualizarTempo(parseFloat(positions.tempo.cx));
        
        cambiarFormaDeOnda(1, true);
        cambiarFormaDeOnda(2, true);
        cambiarDestinoLFO(1, true);
        cambiarDestinoLFO(2, true);

        const cells = document.querySelectorAll('.sequencer-cell');
        cells.forEach(cell => {
            const step = parseInt(cell.dataset.step, 10);
            const note = parseInt(cell.dataset.note, 10);
            const isActive = sequencerData && sequencerData[step] && sequencerData[step][note];
            if (isActive) {
                cell.classList.add('sequencer-cell-active');
            } else {
                cell.classList.remove('sequencer-cell-active');
            }
        });
        
        console.log("Configuración aplicada con éxito.");

    } catch (error) {
        console.error("🛑 ERROR CRÍTICO ao aplicar a configuración:", error);
    }
}

// --- 8. ANIMACIÓN E UTILIDADES ---
function actualizarGlows(unison, fifth) {
    const sustainGlow = sustainActivado;
    vco1Circle.removeAttribute('stroke');
    vco1Circle.removeAttribute('stroke-width');
    vco2Circle.removeAttribute('stroke');
    vco2Circle.removeAttribute('stroke-width');

    if (unison) {
        vco1Circle.setAttribute('stroke', 'white');
        vco1Circle.setAttribute('stroke-width', '2');
        vco2Circle.setAttribute('stroke', 'white');
        vco2Circle.setAttribute('stroke-width', '3');
    } else if (fifth) {
        const fifthGlowColor = '#ffd700';
        vco1Circle.setAttribute('stroke', fifthGlowColor);
        vco1Circle.setAttribute('stroke-width', '2');
        vco2Circle.setAttribute('stroke', fifthGlowColor);
        vco2Circle.setAttribute('stroke-width', '3');
    } else if (sustainGlow) {
        vco1Circle.setAttribute('stroke', '#80deea');
        vco1Circle.setAttribute('stroke-width', '4');
    }
}

function midiToFreq(midiNote) { return 440 * Math.pow(2, (midiNote - 69) / 12); }

function animarLFOs() {
    if(!audioContext) return;
    requestAnimationFrame(animarLFOs);
    const agora = Date.now() / 1000;
    if(lfo1State) {
        const angulo1 = (agora * lfo1State.rate * 360) % 360;
        lfo1Indicator.setAttribute('transform', `rotate(${angulo1}, 100, 100)`);
    }
    if(lfo2State) {
        const angulo2 = (agora * lfo2State.rate * 360) % 360;
        lfo2Indicator.setAttribute('transform', `rotate(${angulo2}, 100, 100)`);
    }
}

function getSvgCoordinates(x, y) {
    const pt = lenzo.createSVGPoint();
    pt.x = x;
    pt.y = y;
    return pt.matrixTransform(lenzo.getScreenCTM().inverse());
}

function mapearRango(valor, minEntrada, maxEntrada, minSaida, maxSaida, invertir = false) {
    if (maxEntrada === minEntrada) return minSaida;
    let val = (valor - minEntrada) / (maxEntrada - minEntrada);
    if (invertir) val = 1 - val;
    let clampedVal = Math.max(0, Math.min(1, val));
    return minSaida + clampedVal * (maxSaida - minSaida);
}

function createWhiteNoiseBuffer(audioContext) {
    const bufferSize = 2 * audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

// --- INICIO DA APLICACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    inicializarSequencer();
    actualizarValoresSintetizador();
    // Engade os listeners para os novos botóns
    saveButton.addEventListener('click', gardarConfiguracion);
    loadButton.addEventListener('click', cargarConfiguracion);
});

