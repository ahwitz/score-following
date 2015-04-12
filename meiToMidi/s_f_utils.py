from __future__ import division
from math import log
from music21 import *

import pdb

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

def timewiseMusic21(parsed):
	measures = parsed[1]
	offsets = {}
	for this_measure in measures:
		measure_offset = this_measure.offset
		voices = [x for x in this_measure if isinstance(x, stream.Voice)]
		for this_voice in voices:
			for item in this_voice:
				item_offset = item.offset + measure_offset
				if isinstance(item, note.Note):
					if offsets.has_key(item_offset):
						offsets[item_offset].append(item.pitch.midi)
					else:
						offsets[item_offset] = [item.pitch.midi]
				elif isinstance(item, chord.Chord):
					for this_note in item: 
						#this can still be item_offset - both notes have same offset as parent chord
						if offsets.has_key(item_offset):
							offsets[item_offset].append(this_note.pitch.midi)
						else:
							offsets[item_offset] = [this_note.pitch.midi]
				elif not isinstance(item, rest.Rest):
					print "Found an", item

	return offsets