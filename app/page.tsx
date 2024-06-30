'use client'

import React, { useEffect, useRef, useState } from 'react';

const FMSynthesizer = () => {
  const audioContextRef = useRef(null);
  const voicesRef = useRef({});
  const gainNodeRef = useRef(null);
  const reverbNodeRef = useRef(null);
  const reverbWetGainRef = useRef(null);
  const delayNodeRef = useRef(null);
  const delayFeedbackGainRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState({});
  const [isAudioContextStarted, setIsAudioContextStarted] = useState(false);
  
  const [modulationIndex, setModulationIndex] = useState(800);
  const [modulationRatio, setModulationRatio] = useState(4);
  const [waveform, setWaveform] = useState('square');
  const [attack, setAttack] = useState(0.0);
  const [decay, setDecay] = useState(0.47);
  const [sustain, setSustain] = useState(0.5);
  const [release, setRelease] = useState(0.2);
  const [reverbWet, setReverbWet] = useState(0.8);
  const [delayTime, setDelayTime] = useState(0.48);
  const [delayFeedback, setDelayFeedback] = useState(0.4);

  const initializeAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.AudioContext)();
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
      gainNodeRef.current.connect(reverbNodeRef.current);
      reverbNodeRef.current.connect(reverbWetGainRef.current);
      delayNodeRef.current.connect(audioContextRef.current.destination);
      reverbWetGainRef.current.connect(audioContextRef.current.destination);
      gainNodeRef.current.connect(audioContextRef.current.destination);
      
      updateReverbWet();
      setIsAudioContextStarted(true);
    }
  };

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (audioContextRef.current) {
      updateReverbWet();
    }
  }, [reverbWet]);

  useEffect(() => {
    if (delayNodeRef.current) {
      delayNodeRef.current.delayTime.setValueAtTime(delayTime, audioContextRef.current.currentTime);
    }
  }, [delayTime]);

  useEffect(() => {
    if (audioContextRef.current) {
      delayFeedbackGainRef.current.gain.setValueAtTime(delayFeedback, audioContextRef.current.currentTime);
    }
  }, [delayFeedback]);

  const createReverb = () => {
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

  const updateReverbWet = () => {
    if (reverbWetGainRef.current) {
      reverbWetGainRef.current.gain.setValueAtTime(reverbWet, audioContextRef.current.currentTime);
    }
  };

  const playNote = (frequency) => {
    if (!isAudioContextStarted) {
      initializeAudioContext();
    }

    if (voicesRef.current[frequency]) {
      return; // Note is already playing
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
    envelope.connect(gainNodeRef.current);
    
    modulator.start(time);
    oscillator.start(time);

    // ADSR Envelope
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + attack);
    envelope.gain.linearRampToValueAtTime(sustain, time + attack + decay);

    voicesRef.current[frequency] = { oscillator, modulator, envelope };
    setIsPlaying((prev) => ({ ...prev, [frequency]: true }));
  };

  const stopNote = (frequency) => {
    if (!voicesRef.current[frequency]) {
      return; // Note is not playing
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
  };

  const handleKeyDown = (event) => {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    const frequencyMap = {
      'z': 261.63, 'x': 293.66, 'c': 329.63, 'v': 349.23,
      'b': 392.00, 'n': 440.00, 'm': 493.88, ',': 523.25
    };
    if (frequencyMap[key]) {
      playNote(frequencyMap[key]);
    }
  };

  const handleKeyUp = (event) => {
    const key = event.key.toLowerCase();
    const frequencyMap = {
      'z': 261.63, 'x': 293.66, 'c': 329.63, 'v': 349.23,
      'b': 392.00, 'n': 440.00, 'm': 493.88, ',': 523.25
    };
    if (frequencyMap[key]) {
      stopNote(frequencyMap[key]);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [attack, decay, sustain, release, waveform, modulationIndex, modulationRatio]);

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Advanced FM Synthesizer with Delay</h2>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','].map((key, index) => (
          <button
            key={key}
            className={`p-4 text-lg font-bold rounded ${
              isPlaying[[261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25][index]]
                ? 'bg-blue-500 text-white'
                : 'bg-white text-black'
            }`}
            onMouseDown={() => playNote([261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25][index])}
            onMouseUp={() => stopNote([261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25][index])}
            onMouseLeave={() => stopNote([261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25][index])}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block mb-2">Modulation Index: {modulationIndex}</label>
          <input
            type="range"
            min="0"
            max="1000"
            value={modulationIndex}
            onChange={(e) => setModulationIndex(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Modulation Ratio: {modulationRatio}</label>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={modulationRatio}
            onChange={(e) => setModulationRatio(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Waveform:</label>
          <select
            value={waveform}
            onChange={(e) => setWaveform(e.target.value)}
            className="w-full p-2 rounded"
          >
            <option value="sine">Sine</option>
            <option value="square">Square</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>
        <div>
          <label className="block mb-2">Reverb: {reverbWet}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={reverbWet}
            onChange={(e) => setReverbWet(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Delay Time: {delayTime}s</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={delayTime}
            onChange={(e) => setDelayTime(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Delay Feedback: {delayFeedback}</label>
          <input
            type="range"
            min="0"
            max="0.9"
            step="0.01"
            value={delayFeedback}
            onChange={(e) => setDelayFeedback(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
      <h3 className="text-xl font-bold mt-4 mb-2">ADSR Envelope</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block mb-2">Attack: {attack}s</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={attack}
            onChange={(e) => setAttack(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Decay: {decay}s</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={decay}
            onChange={(e) => setDecay(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Sustain: {sustain}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sustain}
            onChange={(e) => setSustain(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block mb-2">Release: {release}s</label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={release}
            onChange={(e) => setRelease(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
      <p className="mt-4 text-sm">Press the keys or click the buttons to play notes</p>
    </div>
  );
};

export default FMSynthesizer;
