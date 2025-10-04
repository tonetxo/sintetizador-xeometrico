// Ficheiro: src/file-io.js
import state from './state.js';
import { aplicarConfiguracion } from './ui.js';

/**
 * Reúne a configuración actual do estado e solicita ao proceso principal que a garde nun ficheiro.
 */
export async function gardarConfiguracion() {
    // Crear un obxecto de configuración a partir do estado actual
    const settings = {
        positions: state.ui.positions,
        states: {
            vco1: state.synth.vco1,
            vco2: state.synth.vco2,
            lfo1: state.synth.lfo1,
            lfo2: state.synth.lfo2,
            adsr: state.synth.adsr,
            sequencer: {
                isPlaying: state.sequencer.isPlaying,
                currentStep: state.sequencer.currentStep,
                tempo: state.sequencer.tempo,
                steps: state.sequencer.steps,
                notes: state.sequencer.notes,
            },
            sequencerData: state.sequencer.data,
        }
    };

    // Usar a API exposta en preload.js para mostrar o diálogo de gardar
    const result = await window.electronAPI.saveSettings(settings);

    if (result.success) {
        console.log(`Configuración gardada en: ${result.path}`);
    } else if (!result.cancelled) {
        console.error(`Error gardando a configuración: ${result.error}`);
    }
}

/**
 * Solicita ao proceso principal que mostre un diálogo para cargar unha configuración
 * e, se ten éxito, aplícaa.
 */
export async function cargarConfiguracion() {
    // Usar a API exposta en preload.js para mostrar o diálogo de abrir
    const result = await window.electronAPI.loadSettings();

    if (result.success) {
        console.log("Cargando nova configuración...");
        aplicarConfiguracion(result.data);
    } else if (!result.cancelled) {
        console.error(`Error cargando a configuración: ${result.error}`);
    }
}