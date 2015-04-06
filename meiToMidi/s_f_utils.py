
from math import log

# freq to midi
def freqToMidi(f):
   return int(round(12 * log((f / 440), 2) + 69))

# midi to freq
def midiToFreq(midi):
   return 440/32 * 2**((midi - 9) / 12)

# normalized frequency to Hz
def normToHz(norm, window_length, sample_rate):
	return norm / (window_length / sample_rate)

# normalized frequency to MIDI
def normToMidi(norm, window_length, sample_rate):
	return freqToMidi(normToHz(norm, window_length, sample_rate))

noteArr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def midiToNote(midi):
	return noteArr[midi % 12] + str(int(midi / 12)) 