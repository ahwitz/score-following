from __future__ import division
from music21 import *
from subprocess import call, Popen

from math import ceil, floor, log
from scipy.io import wavfile
from scipy.fftpack import fft
import matplotlib.pyplot as plt
import numpy
import pdb

# freq to midi
def freqToMidi(f):
   return int(12 * log((f / 440), 2) + 69)

# midi to freq
def midiToFreq(midi):
   return 440/32 * 2**((midi - 9) / 12)

# normalized frequency to Hz
def normToHz(norm):
	return norm / (samplesPerQuarter / sample_rate)

# normalized frequency to MIDI
def normToMidi(norm):
	return freqToMidi(normToHz(norm))

noteArr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def midiToNote(midi):
	return noteArr[midi % 12] + str(int(midi / 12)) 


MAX_FREQ = 3000
wav_debug = False
 

meiFile = "meiToMidi/salzinnes/mei/CF-028-music.mei"
stem = 'meiToMidi/cf-028'
p = converter.parseFile(meiFile, None, 'mei', True)
# tempos = [z.secondsPerQuarter() for x, y, z in p.metronomeMarkBoundaries()]
tempo = p.metronomeMarkBoundaries()[0][2].secondsPerQuarter() # in seconds per quarter
p.write('midi', stem + '.midi')
fp = open(stem + ".wav", "w")
p1 = Popen(["timidity", stem + ".midi", "-Ow"], stdout=fp)
wait = p1.wait() #async, make sure file is completely done
fp.close()

# pdb.set_trace()
sample_rate, data = wavfile.read(stem + '.wav')
first_track = data.T[0] # first channel
# audio_data = [(f / 2**16.) for f in first_track] # normalizes to 0; 2^16 is x-bit audio
seconds = len(first_track) / sample_rate
quarters = int(floor(seconds / tempo)) # quarter notes in the piece
samplesPerQuarter = len(first_track) / quarters
plot_length = min(samplesPerQuarter / 2, MAX_FREQ)

#print seconds, quarters, samplesPerQuarter, plot_length

print "Writing: "
for x in range(0, quarters): 
	fourier_plot = fft(first_track[samplesPerQuarter*x:samplesPerQuarter*(x + 1)])
	
	if wav_debug:
		wavfile.write('wavout/quarter' + str(x) + 'wav', sample_rate,  first_track[samplesPerQuarter*x:samplesPerQuarter*(x + 1)])
	
	#print samplesPerQuarter*x, samplesPerQuarter*(x + 1)
	yf = abs(fourier_plot[:plot_length])
	xf = numpy.linspace(0.0, plot_length, plot_length)

	plt.plot(xf, yf, 'r')
	plt.title("Quarter " + str(x))
	midi = normToMidi(numpy.argmax(yf) + 2) # 2 is a temporary magic number
	print "\t", str(x) + ": " + midiToNote(midi)
	plt.savefig('imgout/test' + str(x) + '.png')
	plt.close()

'''function to convert normalized (5.6k) to hz as needed'''