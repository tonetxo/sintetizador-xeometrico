// Ficheiro: src/audio-engine.js
import { createWhiteNoiseBuffer } from './utils.js';

export class AudioEngine {
    constructor() {
        this.audioContext = null;

        // Paraphonic voice system
        this.voices = [];
        this.numVoices = 4;
        this.voiceMixer = null;
        this.activeVoices = new Set();

        // Keep first voice references for backward compatibility
        this.vco1 = null; // Will point to voices[0].vco1
        this.vco2 = null; // Will point to voices[0].vco2
        this.vco2Gain = null; // Will point to voices[0].vco2Gain

        this.vcf = null;
        this.vca = null;
        this.masterGain = null;
        this.noiseGenerator = null;
        this.lfo1Node = null;
        this.lfo1Depth = null;
        this.lfo2Node = null;
        this.lfo2Depth = null;
        this.delayNode = null;
        this.feedbackNode = null;
        this.dryGain = null;
        this.wetGain = null;
        this.limiter = null;
        this.ringModulator = null;
        this.ringModDry = null;
        this.ringModWet = null;

        this.adsr = { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.3 };
        this.vco2TuningMode = 'relative';

        // Configuracións por defecto
        this.formasDeOndaVCO1 = ['sine', 'square', 'triangle', 'sawtooth', 'noise'];
        this.formasDeOndaVCO2 = ['sine', 'square', 'triangle', 'sawtooth'];
    }

    init() {
        if (this.audioContext) {
            if (this.audioContext.state === 'suspended') this.audioContext.resume();
            return;
        }
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create paraphonic voices
        this.voiceMixer = this.audioContext.createGain();
        this.voiceMixer.gain.value = 1.0 / this.numVoices; // Prevent clipping

        for (let i = 0; i < this.numVoices; i++) {
            const voice = {
                vco1: this.audioContext.createOscillator(),
                vco2: this.audioContext.createOscillator(),
                vco2Gain: this.audioContext.createGain(),
                voiceGain: this.audioContext.createGain(),
                active: false,
                currentFreq: 0,
                noteOnTime: 0
            };

            // Set initial types
            voice.vco1.type = 'sine';
            voice.vco2.type = 'sine';
            voice.vco2Gain.gain.value = 0.5;
            voice.voiceGain.gain.value = 0; // Start silent

            // Connect voice internally: vco1 + (vco2 -> vco2Gain) -> voiceGain
            voice.vco1.connect(voice.voiceGain);
            voice.vco2.connect(voice.vco2Gain);
            voice.vco2Gain.connect(voice.voiceGain);

            // Connect voice to mixer
            voice.voiceGain.connect(this.voiceMixer);

            // Start oscillators
            voice.vco1.start();
            voice.vco2.start();

            this.voices.push(voice);
        }

        // Set backward compatibility references to first voice
        this.vco1 = this.voices[0].vco1;
        this.vco2 = this.voices[0].vco2;
        this.vco2Gain = this.voices[0].vco2Gain;

        // Create shared components
        this.vcf = this.audioContext.createBiquadFilter();
        this.vca = this.audioContext.createGain();
        this.masterGain = this.audioContext.createGain();
        this.noiseGenerator = this.audioContext.createBufferSource();
        this.noiseGenerator.buffer = createWhiteNoiseBuffer(this.audioContext);
        this.noiseGenerator.loop = true;
        this.lfo1Node = this.audioContext.createOscillator();
        this.lfo1Depth = this.audioContext.createGain();
        this.lfo2Node = this.audioContext.createOscillator();
        this.lfo2Depth = this.audioContext.createGain();
        this.delayNode = this.audioContext.createDelay(2.0);
        this.feedbackNode = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.limiter = this.audioContext.createDynamicsCompressor();
        this.ringModulator = this.audioContext.createGain();
        this.ringModDry = this.audioContext.createGain();
        this.ringModWet = this.audioContext.createGain();

        // Configuración do Limiter
        this.limiter.threshold.setValueAtTime(-3, this.audioContext.currentTime);
        this.limiter.knee.setValueAtTime(0, this.audioContext.currentTime);
        this.limiter.ratio.setValueAtTime(20, this.audioContext.currentTime);
        this.limiter.attack.setValueAtTime(0, this.audioContext.currentTime);
        this.limiter.release.setValueAtTime(0.1, this.audioContext.currentTime);

        // Conexións
        // this.noiseGenerator.connect(this.vcf); // REMOVED: Managed by setVCO1Waveform

        // Ring modulator only on first voice (for clean sound)
        this.voices[0].vco1.connect(this.ringModulator);
        this.voices[0].vco2.connect(this.ringModulator.gain);
        this.ringModulator.connect(this.ringModWet);

        // Voice mixer routes to ring mod dry and filter
        this.voiceMixer.connect(this.ringModDry);

        this.ringModDry.connect(this.vcf);
        this.ringModWet.connect(this.vcf);

        this.vcf.connect(this.vca).connect(this.masterGain);
        this.masterGain.connect(this.dryGain);
        this.masterGain.connect(this.delayNode);
        this.delayNode.connect(this.feedbackNode).connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        this.dryGain.connect(this.limiter);
        this.wetGain.connect(this.limiter);
        this.limiter.connect(this.audioContext.destination);

        this.lfo1Node.connect(this.lfo1Depth);
        this.lfo2Node.connect(this.lfo2Depth);

        // Valores iniciais
        this.vco1.type = 'sine';
        this.vco2.type = 'sine';
        this.vco2.detune.value = 0;
        this.vco2Gain.gain.value = 0.5;
        this.vcf.type = 'lowpass';
        // Initial VCF values matching visual position (720, 80)
        // x=720, vcfW=60 -> clampedX=720, freq = exp(map(720, 0, 740, ln(20), ln(20000)))
        // y=80 -> newHeight=300, q = map(300, 1, 379, 0.1, 25)
        this.vcf.frequency.value = 18000; // High frequency (near max)
        this.vcf.Q.value = 20; // High resonance
        this.vca.gain.value = 0;
        this.masterGain.gain.value = 0.5;
        this.dryGain.gain.value = 1.0;
        this.wetGain.gain.value = 0.0;
        this.delayNode.delayTime.value = 0.3;
        this.feedbackNode.gain.value = 0.4;
        this.lfo1Node.type = 'sine';
        this.lfo2Node.type = 'triangle';
        this.lfo1Depth.gain.value = 0;
        this.lfo2Depth.gain.value = 0;
        this.ringModDry.gain.value = 1;
        this.ringModWet.gain.value = 0;

        // Boost ring modulator output for more noticeable effect
        // Ring modulation produces sum and difference frequencies which can be quieter
        this.ringModulator.gain.value = 2.0; // Amplify the modulated signal

        // Iniciar osciladores compartidos (voices ya están iniciados)
        this.lfo1Node.start();
        this.lfo2Node.start();
        this.noiseGenerator.start();
    }

    setVCO1Waveform(type) {
        if (!this.audioContext) return;
        if (type === 'noise') {
            // Noise handling - disconnect all voice VCO1s and connect noise
            for (let voice of this.voices) {
                if (voice.vco1.numberOfOutputs > 0) voice.vco1.disconnect();
            }
            this.noiseGenerator.connect(this.vcf);
        } else {
            // Normal waveform - disconnect noise and set all voice VCO1s
            if (this.noiseGenerator.numberOfOutputs > 0) this.noiseGenerator.disconnect();
            for (let voice of this.voices) {
                voice.vco1.type = type;
            }
        }
    }

    setVCO2Waveform(type) {
        for (let voice of this.voices) {
            voice.vco2.type = type;
        }
    }

    setVCO1Frequency(freq) {
        if (this.vco1) this.vco1.frequency.setTargetAtTime(freq, this.audioContext.currentTime, 0.01);
    }

    setVCO2Frequency(freq) {
        if (this.vco2) this.vco2.frequency.setTargetAtTime(freq, this.audioContext.currentTime, 0.01);
    }

    setVCO2Detune(detune) {
        if (this.vco2) this.vco2.detune.setTargetAtTime(detune, this.audioContext.currentTime, 0.02);
    }

    setVCO2Mix(mix) {
        if (this.vco2Gain) this.vco2Gain.gain.setTargetAtTime(mix, this.audioContext.currentTime, 0.02);
    }

    setVCF(freq, q) {
        if (this.vcf) {
            this.vcf.frequency.setTargetAtTime(freq, this.audioContext.currentTime, 0.01);
            this.vcf.Q.setTargetAtTime(q, this.audioContext.currentTime, 0.01);
        }
    }

    setADSR(attack, decay, sustain, release) {
        this.adsr = { attack, decay, sustain, release };
    }

    // Voice allocation methods
    allocateVoice(freq) {
        // Check if this frequency is already playing
        for (let voice of this.voices) {
            if (voice.active && Math.abs(voice.currentFreq - freq) < 1) {
                return voice; // Reuse existing voice
            }
        }

        // Find free voice
        for (let voice of this.voices) {
            if (!voice.active) {
                voice.active = true;
                voice.currentFreq = freq;
                voice.noteOnTime = this.audioContext.currentTime;
                this.activeVoices.add(voice);
                return voice;
            }
        }

        // All voices busy - steal oldest
        let oldest = this.voices[0];
        for (let voice of this.voices) {
            if (voice.noteOnTime < oldest.noteOnTime) {
                oldest = voice;
            }
        }
        oldest.currentFreq = freq;
        oldest.noteOnTime = this.audioContext.currentTime;
        return oldest;
    }

    releaseVoice(freq) {
        for (let voice of this.voices) {
            if (voice.active && Math.abs(voice.currentFreq - freq) < 1) {
                voice.active = false;
                voice.voiceGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.01);
                this.activeVoices.delete(voice);
                return;
            }
        }
    }

    releaseAllVoices() {
        for (let voice of this.voices) {
            if (voice.active) {
                voice.active = false;
                this.activeVoices.delete(voice);
            }
        }
    }

    triggerAttack(freq, volume = 1.0) {
        if (!this.audioContext) this.init();
        const now = this.audioContext.currentTime;
        const microGlideTime = 0.005;

        // Allocate voice for this frequency
        const voice = this.allocateVoice(freq);

        // Set voice frequency
        voice.vco1.frequency.linearRampToValueAtTime(freq, now + microGlideTime);

        // VCO2 follows VCO1
        if (this.vco2TuningMode === 'relative') {
            voice.vco2.frequency.linearRampToValueAtTime(freq, now + microGlideTime);
        } else {
            const currentBaseFreq = voice.vco1.frequency.value;
            const detuneHz = voice.vco2.frequency.value - currentBaseFreq;
            voice.vco2.frequency.linearRampToValueAtTime(freq + detuneHz, now + microGlideTime);
        }

        // Set voice gain to full
        voice.voiceGain.gain.setTargetAtTime(1.0, now, 0.01);

        // Trigger ADSR only if this is the first active voice
        if (this.activeVoices.size === 1) {
            this.vca.gain.cancelScheduledValues(now);
            this.vca.gain.setValueAtTime(this.vca.gain.value, now);
            this.vca.gain.linearRampToValueAtTime(volume, now + this.adsr.attack);
            this.vca.gain.linearRampToValueAtTime(this.adsr.sustain * volume, now + this.adsr.attack + this.adsr.decay);
        }
    }

    triggerRelease() {
        if (!this.audioContext) return;
        const now = this.audioContext.currentTime;

        // Release all active voices
        this.releaseAllVoices();

        // Trigger ADSR release
        this.vca.gain.cancelScheduledValues(now);
        this.vca.gain.setValueAtTime(this.vca.gain.value, now);
        this.vca.gain.linearRampToValueAtTime(0, now + this.adsr.release);
    }

    setDelay(time, feedback, wet) {
        if (this.delayNode) this.delayNode.delayTime.setTargetAtTime(time, this.audioContext.currentTime, 0.1);
        if (this.feedbackNode) this.feedbackNode.gain.setTargetAtTime(feedback, this.audioContext.currentTime, 0.02);
        if (this.wetGain) this.wetGain.gain.setTargetAtTime(wet, this.audioContext.currentTime, 0.02);
    }

    setRingMod(wetAmount) {
        if (this.ringModDry) this.ringModDry.gain.setTargetAtTime(1 - wetAmount, this.audioContext.currentTime, 0.02);
        if (this.ringModWet) this.ringModWet.gain.setTargetAtTime(wetAmount, this.audioContext.currentTime, 0.02);
    }

    setLFO1(rate, depth) {
        if (this.lfo1Node) this.lfo1Node.frequency.setTargetAtTime(rate, this.audioContext.currentTime, 0.01);
        // A profundidade manéxase conectando a destinos específicos, aquí só gardamos o valor se fose necesario globalmente
        // Pero a lóxica de conexión está en `connectLFO`
    }

    // Método xenérico para conectar LFOs a parámetros
    connectLFO(lfoNum, targetParam, depth) {
        const lfoDepthNode = (lfoNum === 1) ? this.lfo1Depth : this.lfo2Depth;
        if (!lfoDepthNode) return;

        // Desconectar de todo primeiro (simplificación, idealmente xestionariamos múltiples conexións)
        lfoDepthNode.disconnect();

        let amount = 0;
        let targetNodeParam = null;

        switch (targetParam) {
            case 'vco1_freq':
                targetNodeParam = this.vco1.frequency;
                amount = this.vco1.frequency.value * depth * 0.25;
                break;
            case 'vco2_freq':
                targetNodeParam = this.vco2.frequency;
                amount = this.vco2.frequency.value * depth * 0.25;
                break;
            case 'vco2_detune':
                targetNodeParam = this.vco2.detune;
                amount = depth * 200;
                break;
            case 'vcf_freq':
                targetNodeParam = this.vcf.frequency;
                amount = depth * 5000;
                break;
            case 'vcf_q':
                targetNodeParam = this.vcf.Q;
                amount = depth * 25;
                break;
        }

        if (targetNodeParam) {
            lfoDepthNode.connect(targetNodeParam);
            lfoDepthNode.gain.setTargetAtTime(amount, this.audioContext.currentTime, 0.01);
        }
    }

    reset() {
        if (!this.audioContext) return;
        const now = this.audioContext.currentTime;
        this.vca.gain.cancelScheduledValues(now);
        this.vca.gain.setValueAtTime(0, now);
        this.feedbackNode.gain.setTargetAtTime(0, now, 0.01);
        this.wetGain.gain.setTargetAtTime(0, now, 0.01);
    }
}
