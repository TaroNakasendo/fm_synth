'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react';

const frequencyMap: Record<string, number> = {
  'z': 261.63, 's': 277.18, 'x': 293.66, 'd': 311.13, 'c': 329.63,
  'v': 349.23, 'g': 369.99, 'b': 392.00, 'h': 415.30, 'n': 440.00,
  'j': 466.16, 'm': 493.88, ',': 523.25, 'l': 554.37, '.': 587.33,
  ';': 622.25, '/': 659.25, '\\': 698.46, ']': 739.99
};

const FMSynthesizer: React.FC = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const voicesRef = useRef<Record<number, any>>({});
  const gainNodeRef = useRef<GainNode | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const reverbWetGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackGainRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState<Record<number, boolean>>({});
  const [isAudioContextStarted, setIsAudioContextStarted] = useState(false);

  const [modulationIndex, setModulationIndex] = useState(800);
  const [modulationRatio, setModulationRatio] = useState(4);
  const [waveform, setWaveform] = useState<OscillatorType>('sawtooth');
  const [attack, setAttack] = useState(0.01);
  const [decay, setDecay] = useState(0.47);
  const [sustain, setSustain] = useState(0.65);
  const [release, setRelease] = useState(0.2);
  const [reverbWet, setReverbWet] = useState(1.0);
  const [delayTime, setDelayTime] = useState(0.48);
  const [delayFeedback, setDelayFeedback] = useState(0.4);
  const [octaveShift, setOctaveShift] = useState(0);

  const updateReverbWet = useCallback(() => {
    if (reverbWetGainRef.current && audioContextRef.current) {
      reverbWetGainRef.current.gain.setValueAtTime(reverbWet, audioContextRef.current.currentTime);
    }
  }, [reverbWet]);

  const initializeAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.setValueAtTime(0.5, audioContextRef.current.currentTime);

      // Create reverb
      reverbNodeRef.current = createReverb();
      reverbWetGainRef.current = audioContextRef.current.createGain();
      reverbWetGainRef.current.gain.setValueAtTime(reverbWet, audioContextRef.current.currentTime);

      // Create delay
      delayNodeRef.current = audioContextRef.current.createDelay(5.0);
      delayNodeRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current.currentTime);
      delayFeedbackGainRef.current = audioContextRef.current.createGain();
      delayFeedbackGainRef.current.gain.setValueAtTime(delayFeedback, audioContextRef.current.currentTime);

      delayNodeRef.current.connect(delayFeedbackGainRef.current);
      delayFeedbackGainRef.current.connect(delayNodeRef.current);

      gainNodeRef.current.connect(delayNodeRef.current);
      if (reverbNodeRef.current) {
        gainNodeRef.current.connect(reverbNodeRef.current);
        reverbNodeRef.current.connect(reverbWetGainRef.current);
      }
      delayNodeRef.current.connect(audioContextRef.current.destination);
      reverbWetGainRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.connect(audioContextRef.current.destination);

      updateReverbWet();
      setIsAudioContextStarted(true);
    }
  }, [delayFeedback, delayTime, reverbWet, updateReverbWet]);

  const createReverb = () => {
    if (!audioContextRef.current) return null;
    const convolver = audioContextRef.current.createConvolver();
    const reverbTime = 2;
    const sampleRate = audioContextRef.current.sampleRate;
    const impulseLength = sampleRate * reverbTime;
    const impulseBuffer = audioContextRef.current.createBuffer(2, impulseLength, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const impulseData = impulseBuffer.getChannelData(channel);
      for (let i = 0; i < impulseLength; i++) {
        impulseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, reverbTime);
      }
    }

    convolver.buffer = impulseBuffer;
    return convolver;
  };

  const playNote = useCallback((frequency: number) => {
    if (!isAudioContextStarted) {
      initializeAudioContext();
    }

    if (!audioContextRef.current || voicesRef.current[frequency]) {
      return; // Note is already playing or audio context is not initialized
    }

    const time = audioContextRef.current.currentTime;

    const oscillator = audioContextRef.current.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, time);

    const modulator = audioContextRef.current.createOscillator();
    modulator.type = waveform;
    modulator.frequency.setValueAtTime(frequency * modulationRatio, time);

    const modulationGain = audioContextRef.current.createGain();
    modulationGain.gain.setValueAtTime(modulationIndex, time);

    const envelope = audioContextRef.current.createGain();
    envelope.gain.setValueAtTime(0, time);

    modulator.connect(modulationGain);
    modulationGain.connect(oscillator.frequency);
    oscillator.connect(envelope);

    if (gainNodeRef.current) {
      envelope.connect(gainNodeRef.current);
    }

    modulator.start(time);
    oscillator.start(time);

    // ADSR Envelope
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + attack);
    envelope.gain.linearRampToValueAtTime(sustain, time + attack + decay);

    voicesRef.current[frequency] = { oscillator, modulator, envelope };
    setIsPlaying((prev) => ({ ...prev, [frequency]: true }));
  }, [attack, decay, initializeAudioContext, isAudioContextStarted, modulationIndex, modulationRatio, sustain, waveform]);

  const stopNote = useCallback((frequency: number) => {
    if (!voicesRef.current[frequency]) {
      return; // Note is not playing
    }

    if (!audioContextRef.current) {
      return; // Audio context is not initialized
    }

    const time = audioContextRef.current.currentTime;
    const { oscillator, modulator, envelope } = voicesRef.current[frequency];

    envelope.gain.cancelScheduledValues(time);
    envelope.gain.setValueAtTime(envelope.gain.value, time);
    envelope.gain.linearRampToValueAtTime(0, time + release);

    oscillator.stop(time + release);
    modulator.stop(time + release);

    setTimeout(() => {
      delete voicesRef.current[frequency];
    }, release * 1000);

    setIsPlaying((prev) => ({ ...prev, [frequency]: false }));
  }, [release]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (frequencyMap[key as keyof typeof frequencyMap]) {
      playNote(frequencyMap[key as keyof typeof frequencyMap] * Math.pow(2, octaveShift));
    }
  }, [octaveShift, playNote]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (frequencyMap[key as keyof typeof frequencyMap]) {
      stopNote(frequencyMap[key as keyof typeof frequencyMap] * Math.pow(2, octaveShift));
    }
  }, [octaveShift, stopNote]);

  const increaseOctave = () => {
    setOctaveShift((prev) => Math.min(prev + 1, 3));
  };

  const decreaseOctave = () => {
    setOctaveShift((prev) => Math.max(prev - 1, -3));
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">19 Key FM Synthesizer with Delay</h2>
      <Keyboard
        frequencyMap={frequencyMap}
        isPlaying={isPlaying}
        octaveShift={octaveShift}
        playNote={playNote}
        stopNote={stopNote}
      />
      <Controls
        modulationIndex={modulationIndex}
        setModulationIndex={setModulationIndex}
        modulationRatio={modulationRatio}
        setModulationRatio={setModulationRatio}
        waveform={waveform}
        setWaveform={setWaveform}
        reverbWet={reverbWet}
        setReverbWet={setReverbWet}
        delayTime={delayTime}
        setDelayTime={setDelayTime}
        delayFeedback={delayFeedback}
        setDelayFeedback={setDelayFeedback}
        attack={attack}
        setAttack={setAttack}
        decay={decay}
        setDecay={setDecay}
        sustain={sustain}
        setSustain={setSustain}
        release={release}
        setRelease={setRelease}
        increaseOctave={increaseOctave}
        decreaseOctave={decreaseOctave}
      />
      <p className="mt-4 text-sm">Press the keys or click the buttons to play notes</p>
      <style jsx>{`
        .playing {
          background: yellow;
        }
      `}</style>
    </div>
  );
};

type KeyboardProps = {
  frequencyMap: Record<string, number>;
  isPlaying: Record<number, boolean>;
  octaveShift: number;
  playNote: (frequency: number) => void;
  stopNote: (frequency: number) => void;
};

const Keyboard: React.FC<KeyboardProps> = ({ frequencyMap, isPlaying, octaveShift, playNote, stopNote }) => (
  <div className="keyboard mb-4">
    {Object.keys(frequencyMap).map((key) => (
      <div
        key={key}
        className={`key ${['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '\\'].includes(key) ? 'white-key' : 'black-key'} ${isPlaying[frequencyMap[key] * Math.pow(2, octaveShift)] ? 'playing' : ''}`}
        onMouseDown={() => playNote(frequencyMap[key] * Math.pow(2, octaveShift))}
        onMouseUp={() => stopNote(frequencyMap[key] * Math.pow(2, octaveShift))}
        onMouseLeave={() => stopNote(frequencyMap[key] * Math.pow(2, octaveShift))}
      >
        {key.toUpperCase()}
      </div>
    ))}
    <style jsx>{`
      .keyboard {
        display: flex;
        flex-wrap: wrap;
      }
      .key {
        width: 40px;
        height: 150px;
        margin: 2px;
        display: flex;
        justify-content: center;
        align-items: flex-end;
        cursor: pointer;
        user-select: none;
        font-size: 14px;
        font-weight: bold;
      }
      .white-key {
        background: white;
        border: 1px solid #000;
      }
      .black-key {
        background: black;
        border: 1px solid #000;
        color: white;
        width: 30px;
        height: 100px;
        margin-left: -15px;
        margin-right: -15px;
        z-index: 1;
      }
      .playing {
        background: yellow;
      }
    `}</style>
  </div>
);

type ControlsProps = {
  modulationIndex: number;
  setModulationIndex: (value: number) => void;
  modulationRatio: number;
  setModulationRatio: (value: number) => void;
  waveform: OscillatorType;
  setWaveform: (value: OscillatorType) => void;
  reverbWet: number;
  setReverbWet: (value: number) => void;
  delayTime: number;
  setDelayTime: (value: number) => void;
  delayFeedback: number;
  setDelayFeedback: (value: number) => void;
  attack: number;
  setAttack: (value: number) => void;
  decay: number;
  setDecay: (value: number) => void;
  sustain: number;
  setSustain: (value: number) => void;
  release: number;
  setRelease: (value: number) => void;
  increaseOctave: () => void;
  decreaseOctave: () => void;
};

const Controls: React.FC<ControlsProps> = ({
  modulationIndex, setModulationIndex,
  modulationRatio, setModulationRatio,
  waveform, setWaveform,
  reverbWet, setReverbWet,
  delayTime, setDelayTime,
  delayFeedback, setDelayFeedback,
  attack, setAttack,
  decay, setDecay,
  sustain, setSustain,
  release, setRelease,
  increaseOctave, decreaseOctave
}) => (
  <>
    <div className="mb-4">
      <button onClick={decreaseOctave} className="p-2 bg-blue-500 text-white rounded mr-2">- Octave</button>
      <button onClick={increaseOctave} className="p-2 bg-blue-500 text-white rounded">+ Octave</button>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <Slider
        label="Modulation Index"
        value={modulationIndex}
        min="0"
        max="1000"
        onChange={setModulationIndex}
      />
      <Slider
        label="Modulation Ratio"
        value={modulationRatio}
        min="0.5"
        max="8"
        step="0.1"
        onChange={setModulationRatio}
      />
      <Select
        label="Waveform"
        value={waveform}
        options={['sine', 'square', 'sawtooth', 'triangle']}
        onChange={setWaveform}
      />
      <Slider
        label="Reverb"
        value={reverbWet}
        min="0"
        max="1"
        step="0.01"
        onChange={setReverbWet}
      />
      <Slider
        label="Delay Time"
        value={delayTime}
        min="0"
        max="1"
        step="0.01"
        onChange={setDelayTime}
      />
      <Slider
        label="Delay Feedback"
        value={delayFeedback}
        min="0"
        max="0.9"
        step="0.01"
        onChange={setDelayFeedback}
      />
    </div>
    <h3 className="text-xl font-bold mt-4 mb-2">ADSR Envelope</h3>
    <div className="grid grid-cols-2 gap-4">
      <Slider
        label="Attack"
        value={attack}
        min="0"
        max="2"
        step="0.01"
        onChange={setAttack}
      />
      <Slider
        label="Decay"
        value={decay}
        min="0"
        max="2"
        step="0.01"
        onChange={setDecay}
      />
      <Slider
        label="Sustain"
        value={sustain}
        min="0"
        max="1"
        step="0.01"
        onChange={setSustain}
      />
      <Slider
        label="Release"
        value={release}
        min="0"
        max="2"
        step="0.01"
        onChange={setRelease}
      />
    </div>
  </>
);

type SliderProps = {
  label: string;
  value: number;
  min: string;
  max: string;
  step?: string;
  onChange: (value: number) => void;
};

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = "1", onChange }) => (
  <div>
    <label className="block mb-2">{label}: {value}</label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  </div>
);

type SelectProps = {
  label: string;
  value: OscillatorType;
  options: string[];
  onChange: (value: OscillatorType) => void;
};

const Select: React.FC<SelectProps> = ({ label, value, options, onChange }) => (
  <div>
    <label className="block mb-2">{label}:</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as OscillatorType)}
      className="w-full p-2 rounded"
    >
      {options.map(option => (
        <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
      ))}
    </select>
  </div>
);

export default FMSynthesizer;
