# python native imports
from __future__ import division
from subprocess import call, Popen
import operator
from math import ceil, floor, log
import argparse

# python non-native imports
from lxml import etree
xml_parser = etree.XMLParser(remove_blank_text=True)

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
match_file = "tempmatch.txt"
match_debug = "tempdebug.txt"

print ("Parsing MEI")
mei_tree = None
with open(mei_file) as fp:
    mei_tree = etree.parse(fp, xml_parser)

root_score_def = mei_tree.xpath("//mei:score/mei:scoreDef", namespaces={'mei': 'http://www.music-encoding.org/ns/mei'})[0]
meter_number = float(root_score_def.attrib["meter.count"])
meter_type = float(root_score_def.attrib["meter.unit"])

# variables used for calculating current temporal distance into the MEI
tempo = 120 # TODO: find an MEI file that actually uses tempo
tempo_seconds = 1 / (tempo / 60) # in seconds per beat (spb)
measure_length = tempo_seconds * meter_number * (meter_type / 4) # spb * beats per measure * (measure denominators per beat)




print ("Prepping WAV rendering of MEI...")
p1 = Popen(["verovio", "-o", midi_out, "-t", "midi", mei_file])
wait = p1.wait() #async, make sure file is completely done
with open(wav_out, "w") as fp:
	p2 = Popen(["timidity", midi_out, "-Ow"], stdout=fp)
	wait = p2.wait() 

print ("Aligning...")
with open(match_debug, "w") as fp:
	p3 = Popen(['java', '-cp', 'match-0.9.4.jar', 'at.ofai.music.match.PerformanceMatcher', '-b', '-ob', match_file, wav_out, audio_file], stdout=fp)
	wait = p3.wait()

print ("Output:")
align_data = {}
with open(match_file) as fp:
	line_arr = fp.readlines()

for line in line_arr:
	split = line.strip().split()
	mei_time = float(split[0])
	audio_time = float(split[1])
	if mei_time in align_data:
		align_data[mei_time].append(audio_time)
	else:
		align_data[mei_time] = [audio_time]

print (align_data)


# Cleanup
#tempdebug.txt
#tempmatch.txt
#tempmei.mid
#tempmei.wav