// Ficheiro: src/renderer.js (Punto de Entrada Principal)

import { initializeSequencer } from './sequencer.js';
import { initializeAll } from './ui.js';
import { initializeAudio } from './audio.js';

/**
 * Función principal que se executa cando o DOM está completamente cargado.
 */
function main() {
    // Inicializa todos os compoñentes da UI (eventos, caché do DOM, etc.)
    initializeAll();

    // Prepara o secuenciador (crea a reixa visual e os datos iniciais)
    initializeSequencer();

    // Non inicializamos o audio aquí, senón na primeira interacción do usuario
    // para cumplir coas políticas de autoplay dos navegadores.
    // A inicialización de audio chámase automaticamente no primeiro 'mousedown'.
    console.log("Sintetizador Xeométrico listo.");
}

// Engadir o listener para executar a función main cando o documento estea listo.
document.addEventListener('DOMContentLoaded', main);