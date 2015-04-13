from __future__ import division
from math import log, ceil
from music21 import *

import pdb

class sfNote:
	def __init__(self, midi, duration, offset):
		self.midi = midi
		self.duration = duration
		self.offset = offset
		# self.beats will be an array of every 
		self.seconds = {x: None for x in range(int(offset), int(offset + duration) + 1)}
		print self.seconds

	def __repr__(self):
		return self.__str__()

	def __str__(self):
		return "Note " + str(self.midi) + " (" + str(self.offset) + " + " + str(self.duration) + ")"


# freq to midi
def freqToMidi(f):
   return int(round(12 * log((f / 440), 2) + 69))

# midi to freq
def midiToFreq(midi):
   return 440/32 * 2**((midi - 9) / 12)

# normalized frequency to Hz
def normToHz(norm, seconds):
	return norm / seconds

# normalized frequency to MIDI
def normToMidi(norm, seconds):
	return freqToMidi(normToHz(norm, seconds))

noteArr = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
def midiToNote(midi):
	return noteArr[midi % 12] + str(int(midi / 12)) 

#converts a music21 stream (or at least the one Christopher created during MEI import) to a dictionary of timewise note onsets
def timewiseMusic21(parsed):
	tempo = parsed.metronomeMarkBoundaries()[0][2].secondsPerQuarter() # in seconds per quarter
	measures = parsed[1]
	offsets = {}
	for this_measure in measures:
		measure_offset = this_measure.offset
		voices = [x for x in this_measure if isinstance(x, stream.Voice)]
		for this_voice in voices:
			for item in this_voice:
				if isinstance(item, note.Note):
					processNote(item, tempo, measure_offset, offsets)
				elif isinstance(item, chord.Chord):
					for this_note in item: 
						processNote(this_note, tempo, measure_offset, offsets)
				elif not isinstance(item, rest.Rest):
					print "Found an unexpected", item

	return offsets, tempo

def processNote(note_ref, tempo, measure_offset, offsets_ref):
	note_dur = max(1.0, note_ref.duration.quarterLength) * tempo
	item_offset = (note_ref.offset + measure_offset) * tempo
	note_obj = sfNote(note_ref.pitch.midi, note_dur, item_offset)

	#for cur_offset in range(0, int(note_dur)): #int conversion is OK cause we want to round down 
	if offsets_ref.has_key(item_offset):
		offsets_ref[item_offset].append(note_obj)
	else:
		offsets_ref[item_offset] = [note_obj]