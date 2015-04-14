from __future__ import division

from math import log, ceil
import string
from enum import Enum
import operator
import uuid

from lxml import etree
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
    print "Explanation guide:"
    for prop in Explanation.__members__:
        print "\t", prop + ":", Explanation.__members__[prop]

#TODO: I dunno, reorganize the objects to be timewise or something because the True/None thing doesn't actually work...
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
                    elif not isinstance(item, note.Rest):
                        print "Found an unexpected", item

        for offset in offsets.keys():
            offsets[offset] = timePoint(offsets[offset], offset, self)

        self.tempo = tempo
        self.offsets = offsets
        self.offset_times = sorted(offsets.keys())

    def processNote(self, note_ref, tempo, measure_offset, offsets_ref):
        note_dur = max(1.0, note_ref.duration.quarterLength) * tempo
        item_offset = (note_ref.offset + measure_offset) * tempo
        note_obj = sfNote(note_ref, note_dur, item_offset)

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

    def getNotelist(self):
        note_id_dict = {}
        for time_point in self.offsets:
            for sf_note in self.offsets[time_point].notes:
                note_id_dict[sf_note.id] = sf_note.offset

        return note_id_dict



class timePoint:
    def __init__(self, note_list, offset, timewise_ref):
        self.notes = note_list
        self.midis = {note.midi: note for note in note_list}
        self.offset = offset
        self.timewise_ref = timewise_ref
        #TODO : ref to parent timewise so the newer/older Explanations can come from here instead of timewise

    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return "[" + string.join([note.__str__() for note in self.notes], ", ") + "]"

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


class sfNote:
    def __init__(self, note_ref, duration, offset):
        self.midi = note_ref.pitch.midi
        self.id = note_ref.id
        self.duration = duration
        self.offset = offset
        # self.seconds is an array of all seconds that the note sounds in - we want string rounded because 1.2 to 3.9 will still be 1, 2, and 3
        self.seconds = {x: None for x in range(int(offset), int(offset + duration) + 1)}
        
    def __repr__(self):
        return self.__str__()

    def __str__(self):
        return "Note " + str(self.midi) + " (" + string.join([str(x) + ": " + str(y) for x, y in self.seconds.iteritems()], " ") + ")"
        #return "Note " + str(self.midi) + " (" + str(self.offset) + " + " + str(self.duration) + ")"


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

def genUUID():
    return 'm-' + str(uuid.uuid4())

def appendNewElement(parent, elementType):
    new_element = etree.Element(elementType)
    parent.append(new_element)
    new_element.attrib['{http://www.w3.org/XML/1998/namespace}id'] = genUUID()
    return new_element

def prependNewElement(parent, elementType):
    new_element = etree.Element(elementType)
    parent.insert(0, new_element)
    new_element.attrib['{http://www.w3.org/XML/1998/namespace}id'] = genUUID()
    return new_element

def offsetToString(offset):
    running_offset = offset
    hours_int = int(running_offset / 3600)
    hours = str(hours_int)
    if len(hours) == 1:
        hours = "0" + hours
    running_offset -= hours_int * 3600

    minutes_int = int(running_offset / 60)
    minutes = str(minutes_int)
    if len(minutes) == 1:
        minutes = "0" + minutes
    running_offset -= minutes_int * 60

    seconds = str(running_offset)
    if len(seconds.split(".")[0]) == 1:
        seconds = "0" + seconds

    return hours + ":" + minutes + ":" + seconds


def addTimeline(timewise, mei_file, stem):
    with open(mei_file, "r") as mei_fp:
        # TODO: one when point per absolute

        # make it look decent
        parser = etree.XMLParser(remove_blank_text=True)
        tree = etree.parse(mei_fp, parser)

        root = tree.getroot()
        root.attrib["meiversion"] = "2013"

        music = root.findall("{http://www.music-encoding.org/ns/mei}music")[0]
        timeline = prependNewElement(music, 'timeline')
        timeline.attrib['avref'] = stem + ".wav"
        origin = appendNewElement(timeline, 'when')
        origin.attrib['absolute'] = "00:00:00"
        timeline.attrib['origin'] = origin.attrib['{http://www.w3.org/XML/1998/namespace}id']

        body = music.findall("{http://www.music-encoding.org/ns/mei}body")[0]
        mdiv = body.findall("{http://www.music-encoding.org/ns/mei}mdiv")[0]
        score = mdiv.findall("{http://www.music-encoding.org/ns/mei}score")[0]
        section = score.findall("{http://www.music-encoding.org/ns/mei}section")[0]
        measure = section.findall("{http://www.music-encoding.org/ns/mei}measure")[0]
        staff = measure.findall("{http://www.music-encoding.org/ns/mei}staff")[0]
        layer = staff.findall("{http://www.music-encoding.org/ns/mei}layer")[0]

        for item_id, item_offset in timewise.getNotelist().iteritems():
            item = layer.xpath("//*[@f:id='" + item_id + "']", namespaces={'f': 'http://www.w3.org/XML/1998/namespace'})[0]
            when = appendNewElement(timeline, 'when')
            when.attrib['absolute'] = offsetToString(item_offset)
            item.attrib['when'] = when.attrib['{http://www.w3.org/XML/1998/namespace}id']

        tree.write(stem + "-out.mei", pretty_print=True)