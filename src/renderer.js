// Ficheiro: src/renderer.js (VERSIÓN REFACTORIZADA E MODULAR)
import { AudioEngine } from './audio-engine.js';
import { Sequencer } from './sequencer.js';
import { UIManager } from './ui-manager.js';

// Instanciar módulos
const audioEngine = new AudioEngine();

// O secuenciador necesita o motor de audio e un callback para actualizar a UI (opcional, ou a UI observa o secuenciador)
// Neste deseño, a UI ten unha referencia ao secuenciador e pode ler o seu estado.
// Pero para o feedback visual do playhead, o secuenciador podería notificar.
// Pasamos un callback simple que a UI pode sobrescribir ou usar eventos.
// Para simplificar, pasamos null e deixamos que a UI se encargue do loop visual se quere, 
// ou mellor, pasamos unha función que a UI asignará despois.
const sequencer = new Sequencer(audioEngine, (step) => {
    // Este callback executarase en cada paso do secuenciador
    // Podemos usalo para sincronizar cousas se é necesario
});

const uiManager = new UIManager(audioEngine, sequencer);

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Iniciando Sintetizador Xeométrico Modular...");

    // Inicializar UI (cachear elementos, listeners)
    uiManager.init();

    // Inicializar Secuenciador (crear grid)
    // O secuenciador necesita inicializar o grid visual, que agora é responsabilidade da UI?
    // O código orixinal tiña 'inicializarSequencer' que creaba o SVG.
    // Deberiamos mover esa creación de SVG ao UIManager.
    // Si, uiManager.init() debería chamar a un método interno para crear o grid.

    // Como movín a lóxica de 'inicializarSequencer' (creación de celdas) a ui-manager?
    // Ups, revisando ui-manager.js... non vin o método 'inicializarSequencer' que crea as celdas SVG!
    // Terei que engadilo a ui-manager.js. O código orixinal tiña un bucle para crear rects.
    // Vou engadilo a ui-manager.js agora mesmo antes de dar por pechado este ficheiro.

    // Pero primeiro, rematemos este ficheiro.

    // Configurar o callback do secuenciador para actualizar a UI
    sequencer.onTickCallback = (step) => {
        uiManager.updateSequencerVisuals(step);
    };

    // Inicializar valores por defecto na UI
    uiManager.actualizarVCO1(0, 0);
    uiManager.actualizarVCO2(0, 0);
    uiManager.actualizarLFO1(0, 0);
    uiManager.actualizarVCF(720, 80);
    // uiManager.actualizarRingMod(0, 150); // Se existe
    uiManager.actualizarADSR(null);
    uiManager.actualizarDelay(580, 530);
    uiManager.actualizarTempo(235);

    // Ocultar liñas iniciais
    if (uiManager.elements.lfo1ModLine) uiManager.elements.lfo1ModLine.style.display = 'none';
    if (uiManager.elements.lfo2ModLine) uiManager.elements.lfo2ModLine.style.display = 'none';

    console.log("✅ Inicialización completada.");
});