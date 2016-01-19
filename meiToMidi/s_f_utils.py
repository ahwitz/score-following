from __future__ import division

from math import log
import uuid

from lxml import etree
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

        for item_id, item_offset in timewise.getNotelist().items():
            item = layer.xpath("//*[@f:id='" + str(item_id) + "']", namespaces={'f': 'http://www.w3.org/XML/1998/namespace'})
            if len(item) > 0:
                when = appendNewElement(timeline, 'when')
                print(timewise.startSilence, item_offset)
                when.attrib['absolute'] = offsetToString(item_offset + timewise.startSilence)
                item[0].attrib['when'] = when.attrib['{http://www.w3.org/XML/1998/namespace}id']

        tree.write(stem + ".mei", pretty_print=True)