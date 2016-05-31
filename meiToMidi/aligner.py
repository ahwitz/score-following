# python native imports
from __future__ import division
from subprocess import call, Popen, PIPE
import operator
from math import ceil, floor, log
import argparse
import uuid
import os

# python non-native imports
from lxml import etree
from music21 import converter
xml_parser = etree.XMLParser(remove_blank_text=True)
xml_namespace = "{http://www.w3.org/XML/1998/namespace}"

# debugging
import pprint
import pdb
import sys


# command-line arguments
parser = argparse.ArgumentParser(description='Process some integers.')
parser.add_argument('--mei', help='mei file to align', required=True)
parser.add_argument('--audio', help='audio file to align', required=True)
args = parser.parse_args()
mei_file = args.mei
audio_file = args.audio

#file locations
new_file_stem = "tempmei"
midi_out = new_file_stem + ".mid"
wav_out = new_file_stem + ".wav"

print ("Parsing MEI...")
mei_tree = None
with open(mei_file) as fp:
    mei_tree = etree.parse(fp, xml_parser)

# prep the new timeline
music = mei_tree.xpath("//mei:music", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'})[0]
music.insert(len(music.getchildren()), etree.Element("timeline"))
timeline = music.getchildren()[-1]
timeline.set(xml_namespace + 'id', 't-' + str(uuid.uuid4()))
timeline.set('origin', 'wh-0')

timeline.insert(len(timeline.getchildren()), etree.Element("when"))
this_when = timeline.getchildren()[-1]
this_when.set(xml_namespace + 'id', 'wh-0')
this_when.set('absolute', '0.0')

music.insert(len(music.getchildren()), etree.Element("performance"))
performance = music.getchildren()[-1]
performance.insert(len(performance.getchildren()), etree.Element("recording"))
recording = performance.getchildren()[-1]
recording.insert(len(recording.getchildren()), etree.Element("avFile"))
av_file = recording.getchildren()[-1]
av_uuid = 'av-' + str(uuid.uuid4())
av_file.set(xml_namespace + 'id', av_uuid)
av_file.set('target', audio_file)
av_file.set("label", 'Aligned audio')
timeline.set('avref', av_uuid)

# prep speed calculations
meter_number = None
meter_type = None
meter_el = mei_tree.xpath("//mei:meter", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'})[0]
if meter_el is not None:
	meter_number = float(meter_el.attrib['count'])
	meter_type = float(meter_el.attrib['unit'])
else:
	root_score_def = mei_tree.xpath("//mei:score/mei:scoreDef", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'})[0]
	meter_number = float(root_score_def.attrib["meter.count"])
	meter_type = float(root_score_def.attrib["meter.unit"])

# variables used for calculating current temporal distance into the MEI
tempo = 120 # TODO: find an MEI file that actually uses tempo
tempo_seconds = 1 / (tempo / 60) # in seconds per beat (spb)
measure_length = tempo_seconds * meter_number * (meter_type / 4) # spb * beats per measure * (measure denominators per beat)

for measure in mei_tree.xpath("//mei:music//mei:measure", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'}):
	try:
		measure_id = measure.attrib[xml_namespace + 'id']
	except KeyError:
		continue
	timeline.insert(len(timeline.getchildren()), etree.Element("when"))
	this_when = timeline.getchildren()[-1]
	this_when.set(xml_namespace + 'id', 'wh-' + str(len(timeline.getchildren()) - 1))
	this_when.set('data', measure.attrib[xml_namespace + 'id'])
	this_when.set('absolute', str(int(measure.attrib['n']) * measure_length))

print ("Prepping WAV rendering of MEI...")

parsed = converter.parseFile(mei_file, None, 'mei', True) # parsed MEI file as a Music21 score
parsed.write('midi', midi_out)
# p1 = Popen(["verovio", "-o", midi_out, "-t", "midi", mei_file])
# wait = p1.wait() #async, make sure file is completely done
with open(wav_out, "w") as fp:
	p2 = Popen(["timidity", midi_out, "-Ow"], stdout=fp)
	wait = p2.wait() 

print ("Aligning...")
align_data = {}
unique_times = []
p3 = Popen(['./sonic-annotator', '-d', 'vamp:match-vamp-plugin:match:a_b', '--multiplex', audio_file, wav_out, '-w', 'csv', '--csv-stdout'], stdout=PIPE)
output = p3.stdout.read().split("\n")

for line in output:
	split = line.split(",")
	if len(split) < 2:
		continue
	mei_time = float(split[1])
	audio_time = float(split[2])
	if mei_time in align_data:
		align_data[mei_time].append(audio_time)
	else:
		unique_times.append(mei_time)
		align_data[mei_time] = [audio_time]
unique_times.sort()

last_measure_time = min(unique_times)
for when in mei_tree.xpath("//when", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'}):
	# pdb.set_trace()
	this_abs = float(when.attrib['absolute'])
	try:
		effective_time = unique_times[unique_times.index(last_measure_time) + 1]
	except ValueError:
		print("whoops, missed", this_abs)
		last_measure_time = this_abs
		continue

	last_measure_time = this_abs
	if effective_time in align_data:
		new_time = max(align_data[effective_time])
		print(this_abs, " -> ", new_time)
		when.set('absolute', str(new_time))
	else:
		print("whoops, missed", this_abs)

with open("test-out.mei", "w") as fp:
	fp.write(etree.tostring(mei_tree.getroot(), pretty_print=True))

# Cleanup
os.remove(midi_out)
os.remove(wav_out)