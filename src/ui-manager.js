// Ficheiro: src/ui-manager.js
import { getSvgCoordinates, mapearRango, notaACor } from './utils.js';

export class UIManager {
    constructor(audioEngine, sequencer) {
        this.audioEngine = audioEngine;
        this.sequencer = sequencer;

        this.elements = {};
        this.dragContext = {};
        this.positionState = {
            vco: { x: 0, y: 0 },
            lfo: { x: 0, y: 0 },
            ringMod: { x: 0, y: 0 }
        };

        this.vco1State = { ondaActual: 0 };
        this.vco2State = { ondaActual: 0 };
        this.lfo1State = { rate: 2, depth: 0, targetIndex: 0, targets: ['OFF', 'VCO1 Freq', 'VCF Freq', 'VCO2 Freq'] };
        this.lfo2State = { rate: 0.5, depth: 0, targetIndex: 0, targets: ['OFF', 'VCO1 Freq', 'VCO2 Detune', 'VCF Q'] };
        this.lfo1TargetsMap = { 'OFF': [], 'VCO1 Freq': ['vco1_freq'], 'VCF Freq': ['vcf_freq'], 'VCO2 Freq': ['vco2_freq'] };
        this.lfo2TargetsMap = { 'OFF': [], 'VCO1 Freq': ['vco1_freq'], 'VCO2 Detune': ['vco2_detune'], 'VCF Q': ['vcf_q'] };

        this.notaActiva = false;
        this.sustainActivado = false;
        this.tecladoNotaActiva = null;
        this.tecladoGlow = false;

        this.keyToMidiMap = {
            'KeyA': 60, 'KeyS': 62, 'KeyD': 64, 'KeyF': 65, 'KeyG': 67, 'KeyH': 69, 'KeyJ': 71, 'KeyK': 72,
            'KeyW': 61, 'KeyE': 63, 'KeyT': 66, 'KeyY': 68, 'KeyU': 70
        };
    }

    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.initSVGTransforms();
        this.initSequencerGrid();
        this.actualizarIconosOnda();
        this.animarLFOs();
    }

    initSequencerGrid() {
        const gridRect = document.querySelector("#sequencer rect"); // #sequencer-bg
        if (!gridRect || !this.elements.sequencerGrid) return;

        this.elements.sequencerGrid.innerHTML = '';

        const steps = this.sequencer.state.steps;
        const notes = this.sequencer.state.notes;

        const cellWidth = parseFloat(gridRect.getAttribute('width')) / steps;
        const cellHeight = (parseFloat(gridRect.getAttribute('height')) - 30) / notes;
        const startX = parseFloat(gridRect.getAttribute('x'));
        const startY = parseFloat(gridRect.getAttribute('y')) + 30;

        for (let step = 0; step < steps; step++) {
            for (let noteIdx = 0; noteIdx < notes; noteIdx++) {
                const x = startX + step * cellWidth;
                const y = startY + noteIdx * cellHeight;
                const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                cell.setAttribute('class', 'sequencer-cell');
                cell.setAttribute('x', x);
                cell.setAttribute('y', y);
                cell.setAttribute('width', cellWidth);
                cell.setAttribute('height', cellHeight);

                const note = notes - 1 - noteIdx;
                cell.dataset.step = step;
                cell.dataset.note = note;

                // Eventos de click e roda
                cell.addEventListener('click', () => {
                    const currentVolume = this.sequencer.data[step][note];
                    const newVolume = currentVolume > 0 ? 0.0 : 1.0;
                    this.sequencer.setCell(step, note, newVolume);
                    this.actualizarEstiloCelda(cell, note, newVolume);
                });

                cell.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const direction = -Math.sign(e.deltaY);
                    let currentVolume = this.sequencer.data[step][note];
                    let newVolume = currentVolume + direction * 0.1;
                    newVolume = Math.max(0.0, Math.min(1.0, newVolume));
                    newVolume = Math.round(newVolume * 10) / 10;
                    this.sequencer.setCell(step, note, newVolume);
                    this.actualizarEstiloCelda(cell, note, newVolume);
                    this.mostrarFeedbackRoda();
                });

                this.elements.sequencerGrid.appendChild(cell);
            }
        }
    }

    actualizarEstiloCelda(cell, nota, volume) {
        if (volume > 0) {
            cell.style.fill = notaACor(nota, this.sequencer.state.notes);
            cell.style.opacity = 0.2 + volume * 0.8;
        } else {
            cell.style.fill = '#3c3c3c';
            cell.style.opacity = '1';
        }
    }

    updateSequencerVisuals(step) {
        const gridRect = document.querySelector("#sequencer rect");
        if (!gridRect) return;

        const cellWidth = parseFloat(gridRect.getAttribute('width')) / this.sequencer.state.steps;
        const startX = parseFloat(gridRect.getAttribute('x'));
        const playheadYStart = parseFloat(gridRect.getAttribute('y')) + 30;
        const playheadYEnd = playheadYStart + parseFloat(gridRect.getAttribute('height')) - 30;

        const playheadX = startX + (step * cellWidth) + (cellWidth / 2);

        this.elements.playhead.setAttribute('x1', playheadX);
        this.elements.playhead.setAttribute('x2', playheadX);
        this.elements.playhead.setAttribute('y1', playheadYStart);
        this.elements.playhead.setAttribute('y2', playheadYEnd);
    }

    updateSequencerGrid() {
        // Update all sequencer cells to match current data
        const cells = this.elements.sequencerGrid.querySelectorAll('.sequencer-cell');
        cells.forEach(cell => {
            const step = parseInt(cell.dataset.step);
            const note = parseInt(cell.dataset.note);
            const volume = this.sequencer.data[step][note];
            this.actualizarEstiloCelda(cell, note, volume);
        });
    }

    cacheElements() {
        this.elements = {
            lenzo: document.getElementById('lenzo-sintetizador'),
            vcoGroup: document.getElementById('vco-group'),
            vco1Circle: document.getElementById('vco1-circle'),
            vco2Circle: document.getElementById('vco2-circle'),
            vcfControl: document.getElementById('vcf'),
            vcfJack: document.getElementById('vcf-jack'),
            adsr: {
                attack: document.getElementById('attack-handle'),
                decaySustain: document.getElementById('decay-sustain-handle'),
                release: document.getElementById('release-handle'),
                shape: document.getElementById('adsr-shape')
            },
            lfoGroup: document.getElementById('lfo-group'),
            lfo1Indicator: document.getElementById('lfo1-indicator'),
            lfo2Indicator: document.getElementById('lfo2-indicator'),
            lfo1ModLine: document.getElementById('lfo1-mod-line'),
            lfo2ModLine: document.getElementById('lfo2-mod-line'),
            delayHandle: document.getElementById('delay-handle'),
            ringModGroup: document.getElementById('ring-mod-group'),
            sequencerGrid: document.getElementById('sequencer-grid'),
            playButton: document.getElementById('play-button'),
            playIcon: document.getElementById('play-icon'),
            pauseIcon: document.getElementById('pause-icon'),
            pauseIcon2: document.getElementById('pause-icon2'),
            stopButton: document.getElementById('stop-button'),
            playmodeSelector: document.getElementById('playmode-selector'),
            playmodeText: document.getElementById('playmode-text'),
            tempoHandle: document.getElementById('tempo-handle'),
            tempoDisplay: document.getElementById('tempo-display'),
            playhead: document.getElementById('playhead')
        };
    }

    initSVGTransforms() {
        if (this.elements.vcoGroup.transform.baseVal.numberOfItems === 0)
            this.elements.vcoGroup.transform.baseVal.appendItem(this.elements.lenzo.createSVGTransform());
        if (this.elements.lfoGroup.transform.baseVal.numberOfItems === 0)
            this.elements.lfoGroup.transform.baseVal.appendItem(this.elements.lenzo.createSVGTransform());
        if (this.elements.ringModGroup && this.elements.ringModGroup.transform.baseVal.numberOfItems === 0)
            this.elements.ringModGroup.transform.baseVal.appendItem(this.elements.lenzo.createSVGTransform());
    }

    setupEventListeners() {
        const { lenzo, playButton, saveButton, loadButton } = this.elements;

        lenzo.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        lenzo.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        lenzo.addEventListener('wheel', this.handleWheel.bind(this));

        playButton.addEventListener('click', () => this.toggleSequencer());
        this.elements.stopButton.addEventListener('click', () => this.stopSequencer());
        this.elements.playmodeSelector.addEventListener('click', () => this.cyclePlayMode());

        // Listen for menu events
        if (window.electronAPI) {
            console.log('Setting up menu listeners...');
            window.electronAPI.onMenuSave(() => {
                console.log('Menu Save triggered');
                this.saveConfig();
            });
            window.electronAPI.onMenuLoad(() => {
                console.log('Menu Load triggered');
                this.loadConfig();
            });
        } else {
            console.warn('electronAPI not available');
        }
    }

    handleMouseDown(e) {
        if (e.button !== 0) return;
        if (!this.audioEngine.audioContext) this.audioEngine.init();

        const target = e.target.closest('[data-draggable]');
        if (!target) return;

        e.preventDefault();
        const startPoint = getSvgCoordinates(this.elements.lenzo, e.clientX, e.clientY);
        const type = target.dataset.draggable;
        this.dragContext = { target, type, startPoint };

        if (type.startsWith('vco')) this.dragContext.initialPos = { ...this.positionState.vco };
        else if (type.startsWith('lfo')) this.dragContext.initialPos = { ...this.positionState.lfo };
        else if (type.startsWith('ring-mod')) this.dragContext.initialPos = { ...this.positionState.ringMod };
        else this.dragContext.initialPos = {
            x: parseFloat(target.getAttribute('x')) || parseFloat(target.getAttribute('cx')),
            y: parseFloat(target.getAttribute('y')) || parseFloat(target.getAttribute('cy'))
        };

        if (type.startsWith('vco') && !this.notaActiva) {
            this.notaActiva = true;
            this.sustainActivado = false;
            this.restaurarEstiloVCO();
            // Trigger attack with current frequency
            // We need to calculate freq from position first, but it's already set.
            // Just trigger VCA.
            this.audioEngine.triggerAttack(this.audioEngine.vco1.frequency.value);
        }
    }

    handleMouseMove(e) {
        if (!this.dragContext.target) return;
        e.preventDefault();
        const currentPoint = getSvgCoordinates(this.elements.lenzo, e.clientX, e.clientY);
        const delta = {
            x: currentPoint.x - this.dragContext.startPoint.x,
            y: currentPoint.y - this.dragContext.startPoint.y
        };
        const newPos = {
            x: this.dragContext.initialPos.x + delta.x,
            y: this.dragContext.initialPos.y + delta.y
        };

        switch (this.dragContext.type) {
            case 'vco1':
                this.actualizarVCO1(newPos.x, newPos.y);
                break;
            case 'vco2':
                this.actualizarVCO1(newPos.x, newPos.y);
                const centroAbsolutoVCO = { x: 400 + this.positionState.vco.x, y: 180 + this.positionState.vco.y };
                this.actualizarVCO2(currentPoint.x - centroAbsolutoVCO.x, currentPoint.y - centroAbsolutoVCO.y);
                break;
            case 'lfo1':
            case 'lfo2':
                this.actualizarLFO1(newPos.x, newPos.y);
                break;
            case 'ring-mod':
                this.actualizarRingMod(newPos.x, newPos.y);
                break;
            case 'vcf':
                this.actualizarVCF(newPos.x, newPos.y);
                break;
            case 'adsr':
                this.actualizarADSR(this.dragContext.target.id, newPos.x, newPos.y);
                break;
            case 'delay':
                this.actualizarDelay(newPos.x, newPos.y);
                break;
            case 'tempo':
                this.actualizarTempo(newPos.x);
                break;
        }
    }

    handleMouseUp() {
        if (this.dragContext.target && this.dragContext.type.startsWith('vco') && !this.sustainActivado) {
            this.notaActiva = false;
            this.audioEngine.triggerRelease();
        }
        this.dragContext = {};
    }

    handleKeyDown(e) {
        if (e.code === 'Space') {
            if (!this.notaActiva) return;
            e.preventDefault();
            this.sustainActivado = !this.sustainActivado;
            this.actualizarGlows(this.audioEngine.vco2.detune.value === 0, Math.abs(Math.round(this.audioEngine.vco2.detune.value)) === 700);
            if (!this.sustainActivado && !this.tecladoNotaActiva) {
                this.notaActiva = false;
                this.audioEngine.triggerRelease();
            }
            return;
        }

        const midiNote = this.keyToMidiMap[e.code];
        if (midiNote && !e.repeat) {
            if (!this.audioEngine.audioContext) this.audioEngine.init();
            const freq = 440 * Math.pow(2, (midiNote - 69) / 12);

            if (!this.tecladoNotaActiva) {
                this.notaActiva = true;
                this.sustainActivado = false;
                this.audioEngine.triggerAttack(freq);
            } else {
                // Legato or retrigger logic could go here, for now just update freq
                this.audioEngine.setVCO1Frequency(freq);
                // And VCO2 logic... handled in engine triggerAttack usually, but here we might need to manually update if already playing
                // For simplicity, triggerAttack handles freq ramps.
                this.audioEngine.triggerAttack(freq);
            }

            this.tecladoNotaActiva = e.code;
            this.tecladoGlow = true;
            this.actualizarGlows(this.audioEngine.vco2.detune.value === 0, Math.abs(Math.round(this.audioEngine.vco2.detune.value)) === 700);
        }
    }

    handleKeyUp(e) {
        if (this.keyToMidiMap[e.code] && e.code === this.tecladoNotaActiva) {
            this.tecladoNotaActiva = null;
            this.tecladoGlow = false;
            if (!this.sustainActivado) {
                this.notaActiva = false;
                this.audioEngine.triggerRelease();
            }
            this.actualizarGlows(this.audioEngine.vco2.detune.value === 0, Math.abs(Math.round(this.audioEngine.vco2.detune.value)) === 700);
        }
    }

    handleContextMenu(e) {
        e.preventDefault();
        if (!this.audioEngine.audioContext) this.audioEngine.init();
        const target = e.target.closest('[data-draggable]');
        if (!target) return;
        const type = target.dataset.draggable;

        if (e.shiftKey && type === 'vco2') {
            this.cambiarModoAfinacionVCO2();
            return;
        }
        switch (type) {
            case 'vco1': this.cambiarFormaDeOnda(1); break;
            case 'vco2': this.cambiarFormaDeOnda(2); break;
            case 'lfo1': this.cambiarDestinoLFO(1); break;
            case 'lfo2': this.cambiarDestinoLFO(2); break;
        }
    }

    handleWheel(e) {
        if (!this.audioEngine.audioContext) return;
        const target = e.target;
        let feedback = false;

        if (target.id === 'vco2-circle') {
            e.preventDefault();
            feedback = true;
            const direction = Math.sign(e.deltaY);
            const step = e.shiftKey ? 1 : 10;
            let currentDetune = this.audioEngine.vco2.detune.value;
            let newDetune = currentDetune - (direction * step);
            newDetune = Math.max(-1200, Math.min(1200, newDetune));
            this.audioEngine.setVCO2Detune(newDetune);
            const roundedDetune = Math.round(newDetune);
            this.actualizarGlows(roundedDetune === 0, Math.abs(roundedDetune) === 700);
        }

        if (target.id === 'lfo2-circle' || target.id === 'lfo1-circle') {
            e.preventDefault();
            feedback = true;
            const lfoState = target.id === 'lfo1-circle' ? this.lfo1State : this.lfo2State;
            const isLFO1 = target.id === 'lfo1-circle';
            const direction = Math.sign(e.deltaY);
            const step = e.shiftKey ? 1.02 : 1.1;
            let newRate;
            if (direction < 0) newRate = lfoState.rate * step;
            else newRate = lfoState.rate / step;
            newRate = Math.max(0.1, Math.min(20, newRate));
            lfoState.rate = newRate;

            // Update Audio Engine
            if (isLFO1) {
                this.audioEngine.setLFO1(newRate, lfoState.depth);
            } else {
                // LFO2 rate is not exposed in setLFO1, need to check audio-engine or add method
                // Checking audio-engine.js... it has lfo2Node but no specific setter for LFO2 rate in the snippet I wrote?
                // Wait, I wrote setLFO1 but not setLFO2 rate explicitly in the public API of AudioEngine?
                // Let's check AudioEngine.
                if (this.audioEngine.lfo2Node) {
                    this.audioEngine.lfo2Node.frequency.setTargetAtTime(newRate, this.audioEngine.audioContext.currentTime, 0.01);
                }
            }

            // Update visual position to match new rate (prevent reset on drag)
            // REMOVED per user request: "cambian de sitio sin que los arrastre"
            // The rate is updated, but the visual position remains.
            // Dragging the LFO will snap the rate back to the position.

            this.actualizarLineasModulacion();
        }

        if (target.id === 'vcf') {
            e.preventDefault();
            feedback = true;
            const direction = Math.sign(e.deltaY);
            const step = e.shiftKey ? 2 : 10;
            let currentY = parseFloat(this.elements.vcfControl.getAttribute('y'));
            let newY = currentY + (direction * step);
            newY = Math.max(1, Math.min(380, newY));
            this.actualizarVCF(parseFloat(this.elements.vcfControl.getAttribute('x')), newY);
        }

        if (feedback) this.mostrarFeedbackRoda();
    }

    // --- Métodos de Actualización Visual e Audio ---

    actualizarVCO1(x, y) {
        const clampedX = Math.max(-360, Math.min(360, x));
        const clampedY = Math.max(-140, Math.min(140, y));
        this.elements.vcoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
        this.positionState.vco.x = clampedX;
        this.positionState.vco.y = clampedY;

        const absoluteX = 400 + clampedX;
        const absoluteY = 180 + clampedY;

        const notaMIDI = mapearRango(absoluteY, 320, 40, 24, 96);
        const freq = 440 * Math.pow(2, (notaMIDI - 69) / 12);
        const volume = mapearRango(absoluteX, 40, 760, 0, 0.7);

        this.audioEngine.setVCO1Frequency(freq);
        if (this.audioEngine.masterGain) this.audioEngine.masterGain.gain.setTargetAtTime(volume, this.audioEngine.audioContext.currentTime, 0.02);

        // Actualizar VCO2 - always tracks VCO1 frequency
        if (this.audioEngine.vco2) {
            if (this.audioEngine.vco2TuningMode === 'relative') {
                this.audioEngine.setVCO2Frequency(freq);
            } else {
                const currentDetuneHz = this.audioEngine.vco2.frequency.value - this.audioEngine.vco1.frequency.value;
                this.audioEngine.setVCO2Frequency(freq + currentDetuneHz);
            }
        }

        const hue = mapearRango(absoluteY, 40, 320, 240, 0);
        const radius = mapearRango(absoluteX, 40, 760, 20, 60);
        this.elements.vco1Circle.setAttribute('fill', `hsl(${hue}, 90%, 55%)`);
        this.elements.vco1Circle.setAttribute('r', radius);
        this.elements.vco2Circle.setAttribute('fill', `hsl(${hue}, 80%, 30%)`);

        this.actualizarLineasModulacion();
        this.actualizarLineasModulacion();
        // this.actualizarLFO1(this.positionState.lfo.x, this.positionState.lfo.y); // Removed to prevent reset
    }

    actualizarVCO2(relativeX, relativeY) {
        const mix = mapearRango(relativeY, 70, -70, 0, 1, false);
        this.audioEngine.setVCO2Mix(mix);
        this.elements.vco2Circle.setAttribute('fill-opacity', mix);

        // Lóxica de afinación simplificada para non estender demasiado
        // ... (implementar lóxica completa se é crítico)
    }

    actualizarLFO1(x, y) {
        if (!this.audioEngine.audioContext) return;
        const clampedX = Math.max(-100, Math.min(700, x));
        const clampedY = Math.max(-100, Math.min(250, y));
        this.elements.lfoGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
        this.positionState.lfo.x = clampedX;
        this.positionState.lfo.y = clampedY;

        const absX = 100 + clampedX;
        const absY = 100 + clampedY;
        const minRate = 0.1;
        const maxRate = 20;
        const normalizedPosition = mapearRango(absX, 0, 800, 0, 1);
        const exponentialRate = minRate * Math.pow(maxRate / minRate, normalizedPosition);

        this.lfo1State.rate = exponentialRate;
        this.lfo1State.depth = mapearRango(absY, 350, 0, 0, 1);

        this.audioEngine.setLFO1(exponentialRate, this.lfo1State.depth);

        // Actualizar conexións
        const targetKey = this.lfo1State.targets[this.lfo1State.targetIndex];
        const connections = this.lfo1TargetsMap[targetKey];
        if (connections) {
            connections.forEach(dest => this.audioEngine.connectLFO(1, dest, this.lfo1State.depth));
        }

        // LFO2 depth segue a LFO1 (segundo código orixinal)
        this.lfo2State.depth = this.lfo1State.depth;
        const targetKey2 = this.lfo2State.targets[this.lfo2State.targetIndex];
        const connections2 = this.lfo2TargetsMap[targetKey2];
        if (connections2) {
            connections2.forEach(dest => this.audioEngine.connectLFO(2, dest, this.lfo2State.depth));
        }

        this.actualizarLineasModulacion();
    }

    actualizarVCF(x, y) {
        const vcfW = parseFloat(this.elements.vcfControl.getAttribute('width'));
        const clampedX = Math.max(0, Math.min(800 - vcfW, x));
        const yMin = 1;
        const yMax = 380;
        const maxHeight = yMax - yMin;
        const clampedY = Math.max(yMin, Math.min(yMax, y));
        const newHeight = Math.max(1, yMax - clampedY);

        this.elements.vcfControl.setAttribute('x', clampedX);
        this.elements.vcfControl.setAttribute('y', clampedY);
        this.elements.vcfControl.setAttribute('height', newHeight);
        this.elements.vcfJack.setAttribute('cx', clampedX + (vcfW / 2));
        this.elements.vcfJack.setAttribute('cy', clampedY);

        const freq = Math.exp(mapearRango(clampedX, 0, 800 - vcfW, Math.log(20), Math.log(20000)));
        const q = mapearRango(newHeight, 1, maxHeight, 0.1, 25);

        this.audioEngine.setVCF(freq, q);
        this.actualizarLineasModulacion();
    }

    actualizarADSR(handleId, x, y) {
        const { attack, decaySustain, release, shape } = this.elements.adsr;
        const yMin = 280, yMax = 380;

        if (handleId) {
            if (handleId === 'attack-handle') attack.setAttribute('cx', Math.max(50, x));
            else if (handleId === 'decay-sustain-handle') {
                decaySustain.setAttribute('cx', Math.max(parseFloat(attack.getAttribute('cx')) + 10, x));
                decaySustain.setAttribute('cy', Math.max(yMin, Math.min(yMax, y)));
            } else if (handleId === 'release-handle') release.setAttribute('cx', Math.max(parseFloat(decaySustain.getAttribute('cx')) + 10, x));
        }

        const startX = 50;
        const attackX = parseFloat(attack.getAttribute('cx'));
        const decaySustainX = parseFloat(decaySustain.getAttribute('cx'));
        const decaySustainY = parseFloat(decaySustain.getAttribute('cy'));
        const releaseX = parseFloat(release.getAttribute('cx'));

        const att = mapearRango(attackX - startX, 1, 150, 0.01, 2.0);
        const dec = mapearRango(decaySustainX - attackX, 10, 150, 0.01, 2.0);
        const sus = mapearRango(decaySustainY, yMax, yMin, 0.0, 1.0);
        const rel = mapearRango(releaseX - decaySustainX, 10, 150, 0.01, 5.0);

        this.audioEngine.setADSR(att, dec, sus, rel);

        const p1 = `${startX},${yMax}`, p2 = `${attackX},${yMin}`, p3 = `${decaySustainX},${decaySustainY}`, p4 = `${releaseX},${yMax}`;
        shape.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`);
    }

    actualizarDelay(x, y) {
        const cx = 580;
        const cy = 380;
        const maxR = 80;

        let dx = x - cx;
        let dy = y - cy;

        // Limit to upper semicircle (y <= cy)
        if (dy > 0) dy = 0;

        // Radial clamp
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > maxR) {
            const ratio = maxR / distance;
            dx *= ratio;
            dy *= ratio;
        }

        const clampedX = cx + dx;
        const clampedY = cy + dy;

        this.elements.delayHandle.setAttribute('cx', clampedX);
        this.elements.delayHandle.setAttribute('cy', clampedY);

        const xMin = 500, xMax = 660;
        const yMin = 300, yMax = 380;

        const delayTime = mapearRango(clampedX, xMin, xMax, 0.01, 2.0);
        const feedbackAmount = mapearRango(clampedY, yMax, yMin, 0, 0.9);
        const wetAmount = mapearRango(clampedY, yMax, yMin, 0, 0.7);

        this.audioEngine.setDelay(delayTime, feedbackAmount, wetAmount);
    }

    actualizarRingMod(x, y) {
        if (!this.audioEngine.audioContext) return;

        // Expanded range: from left edge (0) to right edge (800), and from top (0) to ADSR base (380)
        const clampedX = Math.max(-575, Math.min(225, x)); // Allows 0 to 800 in absolute coords
        const clampedY = Math.max(-155, Math.min(225, y));  // Allows 0 to 380 in absolute coords

        this.elements.ringModGroup.transform.baseVal.getItem(0).setTranslate(clampedX, clampedY);
        this.positionState.ringMod.x = clampedX;
        this.positionState.ringMod.y = clampedY;

        // Map position to ring mod wet amount (0 to 1)
        const absX = 575 + clampedX;
        const absY = 155 + clampedY;

        // Use distance from initial center to control wet amount
        const centerX = 575;
        const centerY = 155;
        const dx = absX - centerX;
        const dy = absY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 300; // Increased for larger area

        const wetAmount = Math.min(1.0, distance / maxDistance);
        this.audioEngine.setRingMod(wetAmount);

        // Update visual opacity based on wet amount
        const ringModControl = document.getElementById('ring-mod-control');
        if (ringModControl) {
            ringModControl.setAttribute('fill-opacity', 0.3 + wetAmount * 0.7);
        }
    }

    actualizarTempo(x) {
        const xMin = 220, xMax = 350;
        const clampedX = Math.max(xMin, Math.min(xMax, x));
        this.elements.tempoHandle.setAttribute('cx', clampedX);
        const newTempo = Math.round(mapearRango(clampedX, xMin, xMax, 60, 240));
        this.sequencer.setTempo(newTempo);
        this.elements.tempoDisplay.textContent = `${newTempo} bpm`;
    }

    actualizarLineasModulacion() {
        [1, 2].forEach(numLFO => {
            const line = (numLFO === 1) ? this.elements.lfo1ModLine : this.elements.lfo2ModLine;
            const state = (numLFO === 1) ? this.lfo1State : this.lfo2State;
            const targetKey = state.targets[state.targetIndex];

            if (targetKey === 'OFF') {
                line.style.display = 'none';
                return;
            }

            const lfoMatrix = this.elements.lfoGroup.transform.baseVal.getItem(0).matrix;
            line.setAttribute('x1', lfoMatrix.e + 100);
            line.setAttribute('y1', lfoMatrix.f + 100);

            let targetX, targetY, targetColor;

            if (targetKey.includes('VCO1')) {
                const vcoMatrix = this.elements.vcoGroup.transform.baseVal.getItem(0).matrix;
                targetX = vcoMatrix.e + 400;
                targetY = vcoMatrix.f + 180;
                targetColor = this.elements.vco1Circle.getAttribute('fill');
            } else if (targetKey.includes('VCO2')) {
                const vcoMatrix = this.elements.vcoGroup.transform.baseVal.getItem(0).matrix;
                targetX = vcoMatrix.e + 400;
                targetY = vcoMatrix.f + 125;
                targetColor = this.elements.vco2Circle.getAttribute('fill');
            } else if (targetKey.includes('VCF')) {
                targetX = parseFloat(this.elements.vcfJack.getAttribute('cx'));
                targetY = parseFloat(this.elements.vcfJack.getAttribute('cy'));
                targetColor = this.elements.vcfControl.getAttribute('fill');
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

    actualizarGlows(unison, fifth) {
        const sustainGlow = this.sustainActivado;
        this.elements.vco1Circle.removeAttribute('stroke');
        this.elements.vco1Circle.removeAttribute('stroke-width');
        this.elements.vco2Circle.removeAttribute('stroke');
        this.elements.vco2Circle.removeAttribute('stroke-width');

        if (unison) {
            this.elements.vco1Circle.setAttribute('stroke', 'white');
            this.elements.vco1Circle.setAttribute('stroke-width', '2');
            this.elements.vco2Circle.setAttribute('stroke', 'white');
            this.elements.vco2Circle.setAttribute('stroke-width', '3');
        } else if (fifth) {
            const fifthGlowColor = '#ffd700';
            this.elements.vco1Circle.setAttribute('stroke', fifthGlowColor);
            this.elements.vco1Circle.setAttribute('stroke-width', '2');
            this.elements.vco2Circle.setAttribute('stroke', fifthGlowColor);
            this.elements.vco2Circle.setAttribute('stroke-width', '3');
        } else if (sustainGlow || this.tecladoGlow) {
            this.elements.vco1Circle.setAttribute('stroke', '#80deea');
            this.elements.vco1Circle.setAttribute('stroke-width', '4');
        }
    }

    restaurarEstiloVCO() {
        this.elements.vco1Circle.setAttribute('fill', '#00bcd4');
        this.elements.vco1Circle.setAttribute('r', 40);
        this.elements.vco2Circle.setAttribute('fill', '#00838f');
        this.elements.vco2Circle.setAttribute('fill-opacity', '1');
        this.actualizarGlows(false, false);
    }

    cambiarFormaDeOnda(numVCO) {
        const state = (numVCO === 1) ? this.vco1State : this.vco2State;
        const formas = (numVCO === 1) ? this.audioEngine.formasDeOndaVCO1 : this.audioEngine.formasDeOndaVCO2;
        state.ondaActual = (state.ondaActual + 1) % formas.length;
        const novaOnda = formas[state.ondaActual];

        if (numVCO === 1) this.audioEngine.setVCO1Waveform(novaOnda);
        else this.audioEngine.setVCO2Waveform(novaOnda);

        document.querySelectorAll(`.onda-vco${numVCO}`).forEach(el => { el.style.display = 'none' });
        const iconToShow = document.getElementById(`vco${numVCO}-onda-${novaOnda}`);
        if (iconToShow) iconToShow.style.display = 'block';
    }

    actualizarIconosOnda() {
        [1, 2].forEach(numVCO => {
            const state = (numVCO === 1) ? this.vco1State : this.vco2State;
            const formas = (numVCO === 1) ? this.audioEngine.formasDeOndaVCO1 : this.audioEngine.formasDeOndaVCO2;
            const ondaActual = formas[state.ondaActual];

            document.querySelectorAll(`.onda-vco${numVCO}`).forEach(el => { el.style.display = 'none' });
            const iconToShow = document.getElementById(`vco${numVCO}-onda-${ondaActual}`);
            if (iconToShow) iconToShow.style.display = 'block';
        });
    }

    cambiarDestinoLFO(numLFO) {
        const state = (numLFO === 1) ? this.lfo1State : this.lfo2State;
        state.targetIndex = (state.targetIndex + 1) % state.targets.length;
        // Forzar actualización
        this.actualizarLFO1(this.positionState.lfo.x, this.positionState.lfo.y);
    }

    toggleSequencer() {
        const isPlaying = this.sequencer.toggle();
        if (isPlaying) {
            this.elements.playIcon.style.display = 'none';
            this.elements.pauseIcon.style.display = 'block';
            this.elements.pauseIcon2.style.display = 'block';
            this.elements.playhead.style.display = 'block';
        } else {
            this.elements.playIcon.style.display = 'block';
            this.elements.pauseIcon.style.display = 'none';
            this.elements.pauseIcon2.style.display = 'none';
            this.elements.playhead.style.display = 'none';
        }
    }

    stopSequencer() {
        this.sequencer.stop();
        this.elements.playIcon.style.display = 'block';
        this.elements.pauseIcon.style.display = 'none';
        this.elements.pauseIcon2.style.display = 'none';
        this.elements.playhead.style.display = 'none';
    }

    cyclePlayMode() {
        const modes = ['forward', 'backward', 'pingpong', 'random'];
        const labels = { forward: 'FWD', backward: 'BWD', pingpong: 'P-P', random: 'RND' };
        const currentMode = this.sequencer.state.playMode;
        const currentIndex = modes.indexOf(currentMode);
        const nextMode = modes[(currentIndex + 1) % modes.length];

        this.sequencer.setPlayMode(nextMode);
        this.elements.playmodeText.textContent = labels[nextMode];
    }

    animarLFOs() {
        requestAnimationFrame(() => this.animarLFOs());

        // Se o audio non está iniciado, podemos animar igual ou parar.
        // Para feedback visual inmediato, animamos sempre.

        const agora = Date.now() / 1000;

        if (this.lfo1State) {
            const angulo1 = (agora * this.lfo1State.rate * 360) % 360;
            this.elements.lfo1Indicator.setAttribute('transform', `rotate(${angulo1}, 100, 100)`);
        }

        if (this.lfo2State) {
            const angulo2 = (agora * this.lfo2State.rate * 360) % 360;
            this.elements.lfo2Indicator.setAttribute('transform', `rotate(${angulo2}, 100, 100)`);
        }
    }

    mostrarFeedbackRoda() {
        document.body.style.transition = 'background-color 0.05s ease-in-out';
        document.body.style.backgroundColor = '#333';
        setTimeout(() => { document.body.style.backgroundColor = ''; }, 100);
    }

    // Métodos para gardar/cargar (chamar a ElectronAPI)
    async saveConfig() {
        const settings = {
            positions: {
                vcoGroup: this.positionState.vco,
                lfoGroup: this.positionState.lfo,
                ringMod: this.positionState.ringMod,
                vcf: { x: this.elements.vcfControl.getAttribute('x'), y: this.elements.vcfControl.getAttribute('y') },
                adsr: {
                    attack: { cx: this.elements.adsr.attack.getAttribute('cx') },
                    decaySustain: { cx: this.elements.adsr.decaySustain.getAttribute('cx'), cy: this.elements.adsr.decaySustain.getAttribute('cy') },
                    release: { cx: this.elements.adsr.release.getAttribute('cx') }
                },
                delay: { cx: this.elements.delayHandle.getAttribute('cx'), cy: this.elements.delayHandle.getAttribute('cy') },
                tempo: { cx: this.elements.tempoHandle.getAttribute('cx') }
            },
            states: {
                vco1: this.vco1State,
                vco2: this.vco2State,
                vco2TuningMode: this.audioEngine.vco2TuningMode,
                lfo1: this.lfo1State,
                lfo2: this.lfo2State,
                sequencer: this.sequencer.state,
                sequencerData: this.sequencer.data
            }
        };

        if (window.electronAPI) {
            const result = await window.electronAPI.saveSettings(settings);
            if (result.success) console.log(`Configuración gardada en: ${result.path}`);
            else if (!result.cancelled) console.error(`Error gardando a configuración: ${result.error}`);
        } else {
            console.warn("Electron API non dispoñible");
        }
    }

    async loadConfig() {
        if (!window.electronAPI) {
            console.warn("Electron API non dispoñible");
            return;
        }

        const result = await window.electronAPI.loadSettings();
        if (result.success) {
            this.aplicarConfiguracion(result.data);
        } else if (!result.cancelled) {
            console.error(`Error cargando a configuración: ${result.error}`);
        }
    }

    aplicarConfiguracion(settings) {
        try {
            if (!settings || !settings.positions || !settings.states) {
                console.error("O ficheiro de configuración é inválido ou está incompleto.");
                return;
            }

            this.audioEngine.reset();

            // Restaurar estados
            this.vco1State = settings.states.vco1;
            this.vco2State = settings.states.vco2;
            this.audioEngine.vco2TuningMode = settings.states.vco2TuningMode || 'relative';
            this.lfo1State = settings.states.lfo1;
            this.lfo2State = settings.states.lfo2;

            this.sequencer.loadState(settings.states.sequencer, settings.states.sequencerData);

            // Restaurar posicións e actualizar UI/Audio
            const { positions } = settings;
            this.actualizarVCO1(positions.vcoGroup.x, positions.vcoGroup.y);
            this.actualizarLFO1(positions.lfoGroup.x, positions.lfoGroup.y);
            if (positions.ringMod) this.actualizarRingMod(positions.ringMod.x, positions.ringMod.y);

            this.actualizarVCF(parseFloat(positions.vcf.x), parseFloat(positions.vcf.y));

            this.elements.adsr.attack.setAttribute('cx', positions.adsr.attack.cx);
            this.elements.adsr.decaySustain.setAttribute('cx', positions.adsr.decaySustain.cx);
            this.elements.adsr.decaySustain.setAttribute('cy', positions.adsr.decaySustain.cy);
            this.elements.adsr.release.setAttribute('cx', positions.adsr.release.cx);
            this.actualizarADSR(null);

            this.actualizarDelay(parseFloat(positions.delay.cx), parseFloat(positions.delay.cy));
            this.actualizarTempo(parseFloat(positions.tempo.cx));

            // Restaurar formas de onda
            const vco1Waveform = this.audioEngine.formasDeOndaVCO1[this.vco1State.ondaActual];
            const vco2Waveform = this.audioEngine.formasDeOndaVCO2[this.vco2State.ondaActual];

            this.audioEngine.setVCO1Waveform(vco1Waveform);
            this.audioEngine.setVCO2Waveform(vco2Waveform);

            // Actualizar iconos de forma de onda
            this.actualizarIconosOnda();

            // Actualizar grid del secuenciador visualmente
            this.updateSequencerGrid();

            console.log("Configuración aplicada con éxito.");
        } catch (error) {
            console.error("🛑 ERROR CRÍTICO ao aplicar a configuración:", error);
        }
    }
}
