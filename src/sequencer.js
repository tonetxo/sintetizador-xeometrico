// Ficheiro: src/sequencer.js

export class Sequencer {
    constructor(audioEngine, onTickCallback) {
        this.audioEngine = audioEngine;
        this.onTickCallback = onTickCallback; // Callback para actualizar a UI

        this.state = {
            isPlaying: false,
            currentStep: 0,
            tempo: 120,
            clockInterval: null,
            steps: 16,
            notes: 12,
            playMode: 'forward', // 'forward', 'backward', 'pingpong', 'random'
            direction: 1 // 1 for forward, -1 for backward (used in ping-pong)
        };

        this.data = [];
        this.initData();
    }

    initData() {
        this.data = Array(this.state.steps).fill(null).map(() => Array(this.state.notes).fill(0.0));
    }

    toggle() {
        this.state.isPlaying = !this.state.isPlaying;
        if (this.state.isPlaying) {
            this.audioEngine.init(); // Asegurar que o audio está iniciado
            // Don't reset position - allows pause/resume
            this.startClock();
        } else {
            this.stopClock();
            // Clean stop: release all voices and trigger release
            if (this.audioEngine.audioContext) {
                this.audioEngine.releaseAllVoices();
                this.audioEngine.triggerRelease();
            }
        }
        return this.state.isPlaying;
    }

    stop() {
        // Full stop: reset to beginning
        this.state.isPlaying = false;
        this.stopClock();
        this.state.currentStep = 0;
        this.state.direction = 1; // Reset direction for ping-pong

        // Clean audio state
        if (this.audioEngine.audioContext) {
            this.audioEngine.releaseAllVoices();
            this.audioEngine.triggerRelease();
        }
    }

    setPlayMode(mode) {
        const validModes = ['forward', 'backward', 'pingpong', 'random'];
        if (validModes.includes(mode)) {
            this.state.playMode = mode;
            this.state.direction = (mode === 'backward') ? -1 : 1;
        }
    }

    startClock() {
        if (this.state.clockInterval) clearInterval(this.state.clockInterval);
        const intervalTime = 60000 / this.state.tempo / 4;
        this.state.clockInterval = setInterval(() => this.tick(), intervalTime);
    }

    stopClock() {
        if (this.state.clockInterval) {
            clearInterval(this.state.clockInterval);
            this.state.clockInterval = null;
        }
    }

    setTempo(bpm) {
        this.state.tempo = bpm;
        if (this.state.isPlaying) {
            this.startClock();
        }
    }

    setCell(step, note, volume) {
        if (this.data[step] && this.data[step][note] !== undefined) {
            this.data[step][note] = volume;
        }
    }

    triggerNote(noteData) {
        if (!this.audioEngine.audioContext) return;

        const now = this.audioEngine.audioContext.currentTime;
        const gateDuration = (60 / this.state.tempo / 4) * 0.9;
        const frequency = 440 * Math.pow(2, (noteData.midiNote - 69) / 12);

        // Trigger attack for this note
        this.audioEngine.triggerAttack(frequency, noteData.volume);
    }


    tick() {
        const step = this.state.currentStep;
        const activeNotes = [];

        // Buscar todas las notas activas en el paso actual
        for (let note = 0; note < this.state.notes; note++) {
            const volume = this.data[step][note];
            if (volume > 0) {
                activeNotes.push({ midiNote: 60 + note, volume: volume });
            }
        }

        // Release previous step notes first
        if (this.audioEngine.audioContext) {
            this.audioEngine.releaseAllVoices();
        }

        // Trigger all active notes (paraphonic)
        if (activeNotes.length > 0) {
            const gateDuration = (60 / this.state.tempo / 4) * 0.9;

            // Trigger all notes
            for (let noteData of activeNotes) {
                this.triggerNote(noteData);
            }

            // Schedule release for this step using engine method
            setTimeout(() => {
                if (this.audioEngine.audioContext && this.state.isPlaying) {
                    this.audioEngine.triggerRelease();
                }
            }, gateDuration * 1000);
        }

        if (this.onTickCallback) {
            this.onTickCallback(step);
        }

        // Update step based on play mode
        this.updateStep();
    }

    updateStep() {
        const { currentStep, steps, playMode, direction } = this.state;

        switch (playMode) {
            case 'forward':
                this.state.currentStep = (currentStep + 1) % steps;
                break;

            case 'backward':
                this.state.currentStep = (currentStep - 1 + steps) % steps;
                break;

            case 'pingpong':
                const nextStep = currentStep + direction;

                // Check boundaries and reverse direction if needed
                if (nextStep >= steps) {
                    this.state.direction = -1;
                    this.state.currentStep = steps - 2; // Bounce back
                } else if (nextStep < 0) {
                    this.state.direction = 1;
                    this.state.currentStep = 1; // Bounce forward
                } else {
                    this.state.currentStep = nextStep;
                }
                break;

            case 'random':
                // Avoid repeating the same step
                let newStep;
                do {
                    newStep = Math.floor(Math.random() * steps);
                } while (newStep === currentStep && steps > 1);
                this.state.currentStep = newStep;
                break;
        }
    }

    loadState(state, data) {
        this.state = { ...this.state, ...state };
        this.data = data;
        // Reiniciar reloxo se é necesario
        if (this.state.isPlaying) this.startClock();
    }
}
