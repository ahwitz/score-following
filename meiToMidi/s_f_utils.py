from __future__ import division

from math import log, ceil
import string
from enum import Enum
import operator

from music21 import *

import pdb

# possible explanations for why we'd be picking up a given MIDI note in a certain timeframe
class Explanation(Enum):
	def __repr__(self):
		return str(self.value)

	def __str__(self):
		return str(self.value)

	PRESENT = 0 # MIDI note is present
	OCTAVE_UP = 1 # MIDI note is specifically the octave above another (usually overtone with highest amplitude)
	OVERTONE = 2 # if the MIDI note is a different overtone
	OCTAVE_DOWN = 3 # if it's an octave below
	ACCIDENTAL = 4 # one MIDI tone off from something
	OLDER_NOTE = 5 # if the note was held longer than expected
	NEWER_NOTE = 6 # if the note started before expected

	UNKNOWN = 100 # can not be explained at the given time point

class timewiseMusic21:
	def __init__(self, parsed):
		tempo = parsed.metronomeMarkBoundaries()[0][2].secondsPerQuarter() # in seconds per quarter
		measures = parsed[1]
		offsets = {}
		for this_measure in measures:
			measure_offset = this_measure.offset
			voices = [x for x in this_measure if isinstance(x, stream.Voice)]
			for this_voice in voices:
				for item in this_voice:
					if isinstance(item, note.Note):
						self.processNote(item, tempo, measure_offset, offsets)
					elif isinstance(item, chord.Chord):
						for this_note in item: 
							self.processNote(this_note, tempo, measure_offset, offsets)
					elif not isinstance(item, rest.Rest):
						print "Found an unexpected", item

		for offset in offsets.keys():
			offsets[offset] = timePoint(offsets[offset])

		self.tempo = tempo
		self.offsets = offsets
		self.offset_times = sorted(offsets.keys())

	def processNote(self, note_ref, tempo, measure_offset, offsets_ref):
		note_dur = max(1.0, note_ref.duration.quarterLength) * tempo
		item_offset = (note_ref.offset + measure_offset) * tempo
		note_obj = sfNote(note_ref.pitch.midi, note_dur, item_offset)

		#for cur_offset in range(0, int(note_dur)): #int conversion is OK cause we want to round down 
		if offsets_ref.has_key(item_offset):
			offsets_ref[item_offset].append(note_obj)
		else:
			offsets_ref[item_offset] = [note_obj]

	def explain(self, midi_in, start_seconds, end_seconds):
		code = Explanation.UNKNOWN
		# TODO: eventually save alt codes
		midi_for_code = midi_in
		alt_midis = []
		for offset in self.offset_times:
			if offset >= start_seconds and offset <= end_seconds:
				code_out, midi_out = self.offsets[offset].explain(midi_in)
			elif offset < start_seconds:
				code_out, midi_out = self.offsets[offset].explain(midi_in)
				if code_out.value == 0:
					code_out = Explanation.OLDER_NOTE #TODO: nested values such as overtone from the last chord (2 and 5?)
				else: 
					continue
			elif offset > end_seconds:
				code_out, midi_out = self.offsets[offset].explain(midi_in)
				if code_out.value == 0:
					code_out = Explanation.NEWER_NOTE
				else: 
					continue

			# if we found a lower code, replace it and reset alt midis
			if code_out.value < code.value:
				code = code_out
				midi_for_code = midi_out
				alt_midis = []

			# if we found the same code, append it to alt_midis
			elif code_out == code:
				if midi_out == midi_for_code:
					alt_midis.append(midi_for_code)
				elif midi_out not in alt_midis:
					alt_midis.append(midi_out)

		# if len(alt_midis) > 0:
		# 	print "Found multiple MIDIs for", midi_in

		return code, midi_for_code


class timePoint:
	def __init__(self, noteList):
		self.notes = noteList
		self.midis = [note.midi for note in noteList]

	def __repr__(self):
		return self.__str__()

	def __str__(self):
		return "[" + string.join([note.__str__() for note in self.notes], ", ") + "]"

	# returns enum code for the explanation and the midi number it likely represents
	def explain(self, midi):
		# first, if the note is present, we've found it
		if midi in self.midis:
			return Explanation.PRESENT, midi

		# else if it's the first octave overtone of something
		if (midi - 12) in self.midis:
			return Explanation.OCTAVE_UP, midi - 12

		# else if it's another overtone
		hz = midiToFreq(midi)
		for this_midi in self.midis:
			if (hz % midiToFreq(this_midi)) == 0:
				#TODO: is overtone of multiple? Higher-weighted or necessary at all?
				#TODO: call in instrument_fft data to see how likely it is
				return Explanation.OVERTONE, this_midi

		# see if it's an octave below something? TODO: would this ever happen?
		if (midi + 12) in self.midis:
			return Explanation.OCTAVE_DOWN, midi + 12

		# see if there was an accidental error
		if (midi + 1) in self.midis:
			return Explanation.ACCIDENTAL, midi + 1
		if (midi - 1) in self.midis:
			return Explanation.ACCIDENTAL, midi - 1

		return Explanation.UNKNOWN, None


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