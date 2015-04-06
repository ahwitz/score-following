from __future__ import division
from music21 import *
from subprocess import call, Popen

from math import ceil, floor, log
from scipy.io import wavfile
from scipy.fftpack import fft
import numpy
import pdb

from midi_fourier import *
from s_f_utils import *

MAX_FREQ = 300000000
SAMPLE_OFFSET = 10000
wav_debug = False
img_debug = True

if img_debug:
	import matplotlib.pyplot as plt

print "Loading file."
#meiFile = "meiToMidi/salzinnes/mei/CF-028-music.mei"
#stem = 'meiToMidi/cf-028'
meiFile = "salzinnes/mei/two-voice.mei"
stem = 'two-voice'

# data to pull in from music21
tempo = 0
instruments = [] # list of MIDI program numbers

parsed = converter.parseFile(meiFile, None, 'mei', True)

# tempos = [z.secondsPerQuarter() for x, y, z in p.metronomeMarkBoundaries()] # I think this is when the piece has multiple tempos... I should comment my code better.
tempo = parsed.metronomeMarkBoundaries()[0][2].secondsPerQuarter() / 4 # in seconds per quarter
for part in parsed[1:]: # parsed[0] is metadata; we don't want that
	instruments.append(part[0].getInstrument(returnDefault = True).midiProgram or 0) # it's part of the measure object (part[0]) for some reason; if it's None we just want 0 (piano)

#write the midi, convert it to wav using Timidity
parsed.write('midi', stem + '.midi')
fp = open(stem + ".wav", "w")
p1 = Popen(["timidity", stem + ".midi", "-Ow"], stdout=fp)
wait = p1.wait() #async, make sure file is completely done
fp.close()

# reload the wav, get the first track
print "Reading wav."
sample_rate, data = wavfile.read(stem + '.wav')
first_track = data.T[0] # first channel

# chop off the spare -1 frames at the end
audible_length = len(first_track) - 1
while first_track[audible_length] == -1:
	audible_length -= 1

# setting various variables that will be used later
seconds = audible_length / sample_rate
# quarters = int(floor(seconds / tempo)) # quarter notes in the piece, only used for window_length
window_length = sample_rate # floor(audible_length / quarters)
plot_length = min(window_length / 2, MAX_FREQ) # window_length/2 because the fourier plot is mirrored
window_seconds = window_length / sample_rate 
num_windows = int(ceil(audible_length / SAMPLE_OFFSET))

print "Writing with", window_length, "frame window size: "
lastMidi = -1
start_point = 0
count = 0
while start_point < audible_length: 
	# start_point is bumped up at the end of this loop
	end_point = start_point + window_length

	# just in case
	if end_point > audible_length:
		break

	# get the fourier transform of this window
	track_subsection = first_track[start_point:end_point]
	fourier_plot = fft(track_subsection)
	
	# print debug wavs if desired
	if wav_debug:
		wavfile.write('wavout/quarter' + str(count) + 'wav', sample_rate, track_subsection)
	
	# what we're actually doing calculations on
	yf = abs(fourier_plot[:plot_length])

	# move everything from normalized frequency to Hz
	hz_plot = [None] * int(ceil(normToHz(plot_length, window_seconds)))
	idx = 0
	for y in yf:
		hz = int(normToHz(idx, window_seconds))
		if hz_plot[hz] == None:
			hz_plot[hz] = [y]
		else:
			hz_plot[hz].append(y)
		idx += 1

	# if window_length > sample_rate, this will average everything that resolves to the same frequency, otherwise it condenses int arrays of length 1 to ints
	hz_plot = [sum(arr) / len(arr) for arr in hz_plot]

	#pdb.set_trace()

	# identify the peaks
	amp_threshold = (numpy.max(yf) / 2)
	idx = 0
	found_midi = []
	print numpy.median(hz_plot), numpy.mean(hz_plot)
	for amp in hz_plot:
		if idx > 0 and amp > amp_threshold:
			ntm = freqToMidi(idx)
			if ntm not in found_midi:
				found_midi.append(ntm)
		idx += 1

	print start_point, end_point, found_midi

	# if the note with greatest amplitude changed, make it known
	midi = normToMidi(numpy.argmax(yf), window_seconds)
	if midi != lastMidi:
		lastMidi = midi
		print "\tNew note at " + str((end_point - start_point) / 2 + start_point)  + ": " + midiToNote(midi) + " (" + str(count) + ")"

	#print image if desired
	if img_debug:
		xf = numpy.linspace(0.0, plot_length, plot_length)
		plt.plot(xf, hz_plot, 'r')
		plt.title("Quarter " + str(count))
		plt.savefig('imgout/test' + str(count) + '.png')
		plt.close()

	start_point += SAMPLE_OFFSET
	count += 1