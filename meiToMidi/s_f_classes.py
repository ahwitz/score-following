from __future__ import division
from enum import Enum
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
    OLDER_OCTAVE_UP = 7 # if it was an overtone on the older note
    NEWER_OCTAVE_UP = 8 # if it was an overtone on the newer note
    OLDER_OVERTONE = 9 # if it was an overtone on the older note
    NEWER_OVERTONE = 10 # if it was an overtone on the newer note

    #TODO: Wrong instrument?

    UNKNOWN = 100 # can not be explained at the given time point

def print_explanation_guide():
    print("Explanation guide:")
    for prop in Explanation.__members__:
        print("\t", prop + ":", Explanation.__members__[prop])

#TODO: I dunno, reorganize the objects to be timewise or something because the True/None thing doesn't actually work...
class timewiseMusic21:
    def __init__(self, parsed):
        self.tempo = parsed.metronomeMarkBoundaries()[0][2].secondsPerQuarter() # in seconds per quarter
        self.offsets = {} # timepoint in seconds: [timewiseNote, timewiseNote]
        self.startSilence = 0
        measures = parsed[1]

        for this_measure in measures:
            measure_offset = this_measure.offset
            # for each voice in each measure, grab all MIDI note values that will be present
            voices = [x for x in this_measure if isinstance(x, stream.Voice)]
            for this_voice in voices:
                for item in this_voice:
                    if isinstance(item, note.Note):
                        self.processNote(item, measure_offset)
                    elif isinstance(item, chord.Chord):
                        for this_note in item: 
                            self.processNote(this_note, measure_offset)
                    elif not isinstance(item, note.Rest):
                        print("Found an unexpected", item)

        # make a timePoint of all the timewiseNotes at a given offset time
        for offset in self.offsets.keys():
            self.offsets[offset] = timewiseTimepoint(self.offsets[offset], offset, self)

        self.offset_times = sorted(self.offsets.keys())

    # Finds the offset with the longest number of MIDI notes
    def findMaxPeaks(self):
        return max([len(self.offsets[timept].midis) for timept in self.offsets])

    # Used to generate offset dictionary
    def processNote(self, note_ref, measure_offset):
        item_offset = (note_ref.offset + measure_offset) # in quarters
        note_obj = timewiseNote(note_ref)

        #for cur_offset in range(0, int(note_dur)): #int conversion is OK cause we want to round down 
        if item_offset in self.offsets:
            self.offsets[item_offset].append(note_obj)
        else:
            self.offsets[item_offset] = [note_obj]

    # explains a given MIDI pitch that is present between start_seconds and end_seconds
    def explain(self, midi_in, start_seconds, end_seconds):
        code = Explanation.UNKNOWN
        # TODO: eventually save alt codes
        midi_for_code = midi_in
        alt_midis = []
        for offset in self.offset_times:
            if offset >= start_seconds and offset <= end_seconds:
                # for each active offset, explain a given note
                code_out, midi_out = self.offsets[offset].explain(midi_in)
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
        #   print "Found multiple MIDIs for", midi_in

        return code, midi_for_code

    # for debug
    def getNotelist(self):
        note_id_dict = {}
        for time_point in self.offsets:
            for sf_note in self.offsets[time_point].notes:
                note_id_dict[sf_note.id] = sf_note.offset

        return note_id_dict

class timewiseTimepoint:
    def __init__(self, note_list, offset, timewise_ref):
        # from input
        self.notes = note_list
        self.midis = [note.midi for note in note_list]
        self.timewise_ref = timewise_ref

        self.expected_offset = offset
        self.found_offset = None
        self.confidence = 0
        #TODO : ref to parent timewise so the newer/older Explanations can come from here instead of timewise

    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return "[" + ", ".join([note.__str__() for note in self.notes]) + "]"

    # returns enum code for the explanation and the midi number it likely represents
    def explain(self, midi):
        # first, if the note is present, we've found it
        if midi in self.midis:
            return self.register_second(Explanation.PRESENT, midi, self.offset)

        # else if it's the first octave overtone of something
        if (midi - 12) in self.midis:
            return self.register_second(Explanation.OCTAVE_UP, midi - 12, self.offset)

        # else if it's another overtone
        hz = midiToFreq(midi)
        for this_midi in self.midis:
            if (hz % midiToFreq(this_midi)) == 0:
                #TODO: is overtone of multiple? Higher-weighted or necessary at all?
                #TODO: call in instrument_fft data to see how likely it is
                return self.register_second(Explanation.OVERTONE, this_midi, self.offset)

        # see if it's an octave below something? TODO: would this ever happen?
        if (midi + 12) in self.midis:
            return self.register_second(Explanation.OCTAVE_DOWN, midi + 12, self.offset)

        # see if there was an accidental error
        if (midi + 1) in self.midis:
            return self.register_second(Explanation.ACCIDENTAL, midi + 1, self.offset)
        if (midi - 1) in self.midis:
            return self.register_second(Explanation.ACCIDENTAL, midi - 1, self.offset)

        idx = self.timewise_ref.offset_times.index(self.offset) - 1
        last_timepoint = self.timewise_ref.offsets[self.timewise_ref.offset_times[idx]]
        last_code, last_midi = last_timepoint.rec_explain(midi, self.offset)

        if last_code.value < Explanation.UNKNOWN.value:
            return last_code, last_midi

        return Explanation.UNKNOWN, None

    def rec_explain(self, midi, offset):
        if midi in self.midis:
            return self.register_second(Explanation.PRESENT, midi, offset)

        # else if it's the first octave overtone of something
        if (midi - 12) in self.midis:
            return self.register_second(Explanation.OCTAVE_UP, midi - 12, offset)

        # else if it's another overtone
        hz = midiToFreq(midi)
        for this_midi in self.midis:
            if (hz % midiToFreq(this_midi)) == 0:
                #TODO: is overtone of multiple? Higher-weighted or necessary at all?
                #TODO: call in instrument_fft data to see how likely it is
                return self.register_second(Explanation.OVERTONE, this_midi, offset)

        return Explanation.UNKNOWN, None

    # tells a note that it was accounted for in a particular second
    def register_second(self, explanation, midi, offset):
        self.midis[midi].seconds[int(offset)] = True
        return explanation, midi

class timewiseNote:
    def __init__(self, note_ref):
        self.midi = note_ref.pitch.midi
        self.id = note_ref.id
        self.expected_duration = note_ref.duration.quarterLength # in quarters
        self.found_duration = None

        # detected offset: strength
        self.offset_strengths = {}

        # for parsing location in audio
        self.detected = False
        self.tracking = False
        self.confidence = 0
        
    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return "Note " + str(self.midi) + ", duration " + str(self.expected_duration)
