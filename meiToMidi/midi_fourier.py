from __future__ import division
from music21 import *
from subprocess import call, Popen
from scipy.io import wavfile
from scipy.fftpack import fft
import numpy
import os
import sys
import json

import pdb

from s_f_utils import *

img_debug = False

if img_debug:
	import matplotlib.pyplot as plt

def transformInstrument(program_number):
	tempdir = "tempdir/"

	if os.path.isdir(tempdir):
		if os.listdir(tempdir) != []:
			print "tempdir is not empty; aborting"
			sys.exit(1)

	else:
		os.mkdir(tempdir)

	inst_data = {}
	temp_stream = stream.Stream()
	temp_stream.append(instrument.instrumentFromMidiProgram(program_number))
	print "Generating JSON for MIDI program number", str(program_number) + "."
	for cur_pitch in range(12, 125):
		# print "Plotting for", cur_pitch
		# prep variables for file locations
		midi_location = tempdir + str(cur_pitch) + '.midi'
		wav_location = tempdir + str(cur_pitch) + '.wav'

		# make a music21 stream with one note in it, write to midi
		temp_stream.append(note.Note(cur_pitch, type='quarter'))
		temp_stream.write('midi', midi_location)

		# convert the midi to wav using timidity
		with open(wav_location, "w") as wave_file:
			p1 = Popen(["timidity", midi_location, "-Ow"], stdout=wave_file)
			wait = p1.wait() #async, make sure file is completely done

		# load the temp wav file in 
		sample_rate, data = wavfile.read(wav_location)
		first_track = data.T[0][:44100]
		# first_track = [(f / 2**16.) for f in data.T[0]] # normalized
		audible_length = len(first_track)
		seconds = audible_length / sample_rate

		fourier_data = abs(fft(first_track))
		plotted = {}

		idx = 0
		hz_threshold = midiToFreq(cur_pitch) * 10
		for y in fourier_data[:10000]:
			cur_hz = int(normToHz(idx, seconds))
			if cur_hz > hz_threshold: # if the current hz is greater than 10 times the original note, cut it off
				break
			if cur_hz in plotted:
				plotted[cur_hz].append(y)
			else:
				plotted[cur_hz] = [y]

			idx += 1

		for x in plotted:
			arr = plotted[x]
			plotted[x] = str(int(sum(arr) / len(arr))) # average rounded to int

		inst_data[cur_pitch] = plotted

		if img_debug:
			xf = numpy.linspace(0.0, audible_length / 2, audible_length / 2)[:2000]
			plt.plot(xf, fourier_data[:2000], 'r')
			plt.title("Quarterasd " + str(cur_pitch))
			plt.savefig(tempdir + 'test' + str(cur_pitch) + '.png')
			plt.close()

		# clean up
		temp_stream.pop(1) # remove the note, keep the instrument
		os.remove(midi_location) # remove the midi file
		os.remove(wav_location) # same for wav

	os.rmdir(tempdir) # and remove the directory at the end

	with open('instrument_data/instrument-' + str(program_number) + '.json', 'w') as outfile:
	    json.dump(inst_data, outfile)


# returns the file or False if file doesn't exist
def loadInstrument(program_number):
	filename = 'instrument_data/instrument-' + str(program_number) + '.json'
	if not os.path.isfile(filename):
		return False

	json_file = open('instrument_data/instrument-' + str(program_number) + '.json', 'r')
	json_dict = json.load(json_file)
	return json_dict


if __name__ == "__main__":
	print "You're running this directly."
	transformInstrument(0)