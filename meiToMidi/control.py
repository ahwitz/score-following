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
   return int(round(12 * log((f / 440), 2) + 69))

# midi to freq
def midiToFreq(midi):
   return 440/32 * 2**((midi - 9) / 12)

# normalized frequency to Hz
def normToHz(norm):
	return norm / (window_length / sample_rate)

# normalized frequency to MIDI
def normToMidi(norm):
	return freqToMidi(normToHz(norm))

noteArr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def midiToNote(midi):
	return noteArr[midi % 12] + str(int(midi / 12)) 


MAX_FREQ = 3000
wav_debug = False
img_debug = False
normalize_audio = False
sample_offset = 1000

print "Loading file."
#meiFile = "meiToMidi/salzinnes/mei/CF-028-music.mei"
#stem = 'meiToMidi/cf-028'
meiFile = "meiToMidi/salzinnes/mei/two-voice.mei"
stem = 'meiToMidi/two-voice'

p = converter.parseFile(meiFile, None, 'mei', True)
# tempos = [z.secondsPerQuarter() for x, y, z in p.metronomeMarkBoundaries()]
tempo = p.metronomeMarkBoundaries()[0][2].secondsPerQuarter() / 4 # in seconds per quarter
p.write('midi', stem + '.midi')
fp = open(stem + ".wav", "w")
p1 = Popen(["timidity", stem + ".midi", "-Ow"], stdout=fp)
wait = p1.wait() #async, make sure file is completely done
fp.close()

# pdb.set_trace()
print "Reading wav."
sample_rate, data = wavfile.read(stem + '.wav')
first_track = data.T[0] # first channel
if normalize_audio:
	# normalizes to 0; 2^16 is x-bit audio
	first_track = [(f / 2**16.) for f in first_track]

audible_length = len(first_track) - 1
while first_track[audible_length] == -1:
	audible_length -= 1

print audible_length, len(first_track)

seconds = audible_length / sample_rate
quarters = int(floor(seconds / tempo)) # quarter notes in the piece
window_length = floor(audible_length / quarters)
num_windows = int(ceil(audible_length / sample_offset))

print num_windows

plot_length = min(window_length / 2, MAX_FREQ)

print "Writing with", window_length, "frame window size: "
lastMidi = -1
start_point = 0
count = 0
while start_point < audible_length: 
	#start_point = int(num_windows * x)
	#end_point = min(int(num_windows * x + window_length), len(first_track) - 1)
	end_point = start_point + window_length

	if end_point > audible_length:
		break

	track_subsection = first_track[start_point:end_point]
	fourier_plot = fft(track_subsection)
	
	if wav_debug:
		wavfile.write('wavout/quarter' + str(count) + 'wav', sample_rate, track_subsection)
	
	#print window_length*x, window_length*(x + 1)
	yf = abs(fourier_plot[:plot_length])
	xf = numpy.linspace(0.0, plot_length, plot_length)

	threshold = (numpy.max(yf) / 2)
	idx = 0
	string = "\t"
	for y in yf:
		if y > threshold and idx > 0:
			string += str(normToMidi(idx)) + " "
		idx += 1

	print start_point, end_point, string

	midi = normToMidi(numpy.argmax(yf))
	if midi != lastMidi:
		lastMidi = midi
		print "\tNew note at " + str((end_point - start_point) / 2 + start_point)  + ": " + midiToNote(midi) + " (" + str(count) + ")"

	if img_debug:
		plt.plot(xf, yf, 'r')
		plt.title("Quarter " + str(count))
		plt.savefig('imgout/test' + str(count) + '.png')
		plt.close()

	start_point = end_point
	count += 1