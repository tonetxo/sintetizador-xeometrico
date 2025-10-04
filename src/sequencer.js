// Ficheiro: src/sequencer.js
import state, { initializeSequencerData } from './state.js';
import { DOM_IDS, SEQUENCER_DEFAULTS } from './constants.js';
import { triggerSequencerNote, initializeAudio } from './audio.js';
import { notaACor, actualizarEstiloCelda, mostrarFeedbackRoda } from './ui.js';

/**
 * Inicializa o secuenciador, crea a reixa visual e establece os eventos.
 */
export function initializeSequencer() {
    initializeSequencerData();
    const { domCache } = state.ui;
    const sequencerGrid = domCache.sequencerGrid;
    if (!sequencerGrid) return;

    sequencerGrid.innerHTML = ''; // Limpar a reixa anterior

    const gridRect = document.querySelector("#sequencer-bg"); // Usamos o fondo para as dimensións
    if (!gridRect) return;

    const { steps, notes } = state.sequencer;
    const cellWidth = parseFloat(gridRect.getAttribute('width')) / steps;
    const cellHeight = (parseFloat(gridRect.getAttribute('height')) - 30) / notes; // Deixar espazo para controis
    const startX = parseFloat(gridRect.getAttribute('x'));
    const startY = parseFloat(gridRect.getAttribute('y')) + 30;

    for (let step = 0; step < steps; step++) {
        for (let noteIdx = 0; noteIdx < notes; noteIdx++) {
            const x = startX + step * cellWidth;
            const y = startY + noteIdx * cellHeight;
            const cell = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const note = notes - 1 - noteIdx; // Invertir para que as notas altas estean arriba

            cell.setAttribute('class', 'sequencer-cell');
            cell.setAttribute('x', x);
            cell.setAttribute('y', y);
            cell.setAttribute('width', cellWidth - 1); // Pequeno espazo entre celas
            cell.setAttribute('height', cellHeight - 1);
            cell.dataset.step = step;
            cell.dataset.note = note;

            // Evento de clic para activar/desactivar nota
            cell.addEventListener('click', () => {
                const currentVolume = state.sequencer.data[step][note];
                const newVolume = currentVolume > 0 ? 0.0 : 1.0;
                state.sequencer.data[step][note] = newVolume;
                actualizarEstiloCelda(cell, note, newVolume);
            });

            // Evento de roda para axustar o volume
            cell.addEventListener('wheel', (e) => {
                e.preventDefault();
                const direction = -Math.sign(e.deltaY);
                let currentVolume = state.sequencer.data[step][note];
                let newVolume = currentVolume + direction * 0.1;
                newVolume = Math.max(0.0, Math.min(1.0, newVolume));
                newVolume = Math.round(newVolume * 10) / 10; // Redondear a un decimal
                state.sequencer.data[step][note] = newVolume;
                actualizarEstiloCelda(cell, note, newVolume);
                mostrarFeedbackRoda();
            });

            sequencerGrid.appendChild(cell);
            actualizarEstiloCelda(cell, note, state.sequencer.data[step][note]);
        }
    }
}

/**
 * Inicia ou detén a reprodución do secuenciador.
 */
export function startStopSequencer() {
    state.sequencer.isPlaying = !state.sequencer.isPlaying;
    const { domCache } = state.ui;

    if (state.sequencer.isPlaying) {
        if (!state.audio.isInitialized) {
            initializeAudio();
        }
        // Asegurarse de que o paso actual sexa válido
        state.sequencer.currentStep = (state.sequencer.currentStep - 1 + state.sequencer.steps) % state.sequencer.steps;

        domCache.playIcon.style.display = 'none';
        domCache.stopIcon.style.display = 'block';
        domCache.playhead.style.display = 'block';

        // Asegurarse de que o tempo sexa un número positivo para evitar un intervalo infinito.
        const tempoSeguro = Math.max(1, state.sequencer.tempo || 120);
        const intervalTime = 60000 / tempoSeguro / 4; // 16th notes
        state.sequencer.clockInterval = setInterval(tick, intervalTime);
    } else {
        domCache.playIcon.style.display = 'block';
        domCache.stopIcon.style.display = 'none';
        domCache.playhead.style.display = 'none';

        clearInterval(state.sequencer.clockInterval);
        state.sequencer.clockInterval = null;
    }
}

/**
 * O "pulso" do reloxo do secuenciador. Execútase en cada paso.
 */
function tick() {
    const step = state.sequencer.currentStep;
    let noteToPlay = null;

    // Atopar a nota máis alta activa neste paso
    for (let note = state.sequencer.notes - 1; note >= 0; note--) {
        const volume = state.sequencer.data[step][note];
        if (volume > 0) {
            noteToPlay = { midiNote: SEQUENCER_DEFAULTS.startNote + note, volume: volume };
            break;
        }
    }

    if (noteToPlay) {
        triggerSequencerNote(noteToPlay);
    }

    updatePlayhead(step);
    state.sequencer.currentStep = (step + 1) % state.sequencer.steps;
}

/**
 * Actualiza a posición da liña de reprodución (playhead).
 * @param {number} step - O paso actual do secuenciador.
 */
function updatePlayhead(step) {
    const playhead = state.ui.domCache.playhead;
    const gridRect = document.querySelector("#sequencer-bg");
    if (!gridRect || !playhead) return;

    const cellWidth = parseFloat(gridRect.getAttribute('width')) / state.sequencer.steps;
    const startX = parseFloat(gridRect.getAttribute('x'));
    const playheadYStart = parseFloat(gridRect.getAttribute('y')) + 30;
    const playheadYEnd = playheadYStart + parseFloat(gridRect.getAttribute('height')) - 30;
    const playheadX = startX + (step * cellWidth) + (cellWidth / 2);

    playhead.setAttribute('x1', playheadX);
    playhead.setAttribute('x2', playheadX);
    playhead.setAttribute('y1', playheadYStart);
    playhead.setAttribute('y2', playheadYEnd);
}

/**
 * Recarga os datos do secuenciador na interface gráfica.
 * Útil cando se carga unha configuración.
 */
export function reloadSequencerUI() {
    const cells = document.querySelectorAll('.sequencer-cell');
    cells.forEach(cell => {
        const step = parseInt(cell.dataset.step, 10);
        const note = parseInt(cell.dataset.note, 10);
        const volume = (state.sequencer.data && state.sequencer.data[step] && state.sequencer.data[step][note] !== undefined)
            ? state.sequencer.data[step][note]
            : 0;
        actualizarEstiloCelda(cell, note, volume);
    });
}