# python native imports
from __future__ import division
from subprocess import call, Popen
import operator
from math import ceil, floor, log
import argparse

# downloaded imports
from music21 import *
import numpy
from scipy.io import wavfile
from scipy.fftpack import fft

# my code
from midi_fourier import *
from s_f_utils import *
from s_f_classes import *

# debugging
import pprint
import pdb
import sys

# command-line arguments
parser = argparse.ArgumentParser(description='Process some integers.')
parser.add_argument('--mei', help='mei file to align', required=True)
parser.add_argument('--audio', help='audio file to align')
args = parser.parse_args()
mei_file = args.mei
audio_file = args.audio
new_file_stem = mei_file.split(".")[0] + "-out"

#TODO: cli for converting to wav and appending timeline info
# write the midi, convert it to wav using Timidity
# parsed.write('midi', new_file_stem + '.midi')
# fp = open(new_file_stem + ".wav", "w")
# p1 = Popen(["timidity", new_file_stem + ".midi", "-Ow"], stdout=fp)
# wait = p1.wait() #async, make sure file is completely done
# fp.close()

# Globals
pp = pprint.PrettyPrinter(indent=4)
MAX_FREQ = 300000000 # not actually that important, just needs to be large
SMOOTH_DISTANCE = 5 # Hz to smooth out each peak by 
LOCAL_MAX_DISTANCE = 10 # distance from each expected peak to search for the actual value
NUM_PEAKS = 1 # number of top peaks to account for in each window, to be defined later
wav_debug = False # debugs by printing out wavs of each window TODO: CLI
img_debug = False # debugs by printing out waveform graphs of each window TODO: CLI
if img_debug:
    import matplotlib.pyplot as plt

# Parse MEI and WAV
print ("Parsing MEI...")
instruments_fft = {} # eventually, fft data archived by midi_fourier.py
parsed = converter.parseFile(mei_file, None, 'mei', True) # parsed MEI file as a Music21 score
timewise = timewiseMusic21(parsed) # local format
NUM_PEAKS = timewise.findMaxPeaks()
tempo = timewise.tempo # default tempo of the piece
# tempos = [z.secondsPerQuarter() for x, y, z in p.metronomeMarkBoundaries()] # When the piece has multiple tempos

# load the pre-parsed instrument data
instruments = [] # list of MIDI program numbers
for part in parsed[1:]: # parsed[0] is metadata; we don't want that
    # TODO: have it parse new instruments if it doesn't have it stored yet, also keep track of what soundfont/MIDI library has been parsed, if this changes redo them
    this_instrument = part[0].getInstrument(returnDefault = True).midiProgram or 0 # it's part of the measure object (part[0]) for some reason; if it's None we just want 0 (piano)

    if this_instrument not in instruments:
        instruments.append(this_instrument) 
        instruments_fft[this_instrument] = loadInstrument(this_instrument) # from midi_fourier.py

# reload the wav, get the first track
print("Reading wav...")
sample_rate, data = wavfile.read(audio_file)
first_track = data.T[0] # first channel

# chop off any empty frames from the end
audible_length = len(first_track) - 1
while first_track[audible_length] == -1:
    audible_length -= 1

# setting various variables that will be used later
seconds = audible_length / sample_rate # length of the piece in seconds
window_length = sample_rate # length of the window to use TODO: CLI
window_seconds = window_length / sample_rate # length of each window in seconds
sample_offset = int(floor(audible_length / (seconds / tempo))) # distance between window beginnings TODO: CLI
plot_length = min(window_length / 2, MAX_FREQ) # length of the fourier plot, window_length/2 because the fourier plot is mirrored

# Alignment time!
start_point = 0 # current start frame
count = 0 # nth window, used for debug
events = {} # list of things that happened
silent = True # tracks while the music is silent at the beginning
print("Aligning with window size of", str(window_length) + "...")

while start_point < audible_length: 
    # start_point is bumped up at the end of the loop
    end_point = start_point + window_length
    if end_point > audible_length:  # just in case
        break

    # convert frames to seconds
    start_seconds = start_point / sample_rate
    end_seconds = end_point / sample_rate

    # get the fourier transform of this window
    track_subsection = first_track[start_point:end_point]
    fourier_plot = fft(track_subsection)
    yf = abs(fourier_plot[:plot_length])
    
    # print debug wavs if desired
    if wav_debug:
        wavfile.write('wavout/quarter' + str(count) + 'wav', sample_rate, track_subsection)

    # move everything from normalized frequency to Hz
    hz_plot = [None] * int(ceil(normToHz(plot_length, window_seconds))) # 0 to highest hz for the x axis
    idx = 0
    for y in yf:
        hz = int(normToHz(idx, window_seconds))
        if hz_plot[hz] == None:
            hz_plot[hz] = [y]
        else:
            hz_plot[hz].append(y)
        idx += 1

    # if multiple normalized frequencies lined up with the same integer Hz, average them
    idx = 0
    for arr in hz_plot:
        if arr == None:
            idx += 1
            continue
        else:
            hz_plot[idx] = sum(arr) / len(arr)
            idx += 1

    # print the fourier graph if desired
    if img_debug:
        xf = numpy.linspace(0.0, plot_length, plot_length)
        plt.plot(xf[:1500], hz_plot[:1500], 'r')
        plt.title("Quarter " + str(count))
        plt.savefig('imgout/test' + str(count) + '.png')
        plt.close()

    found_midi = {} # list of found notes and their explanations
    hz_max = numpy.argmax(hz_plot) # max frequency
    if hz_max > 0: # if there's any volume in this frame
        if silent: # and it was silent before, cap the silence
            timewise.startSilence = start_seconds
        silent = False
        
    # TODO: FUCKIN MAKE THIS BETTER
        for x in range(0, NUM_PEAKS):
            hz_max = numpy.argmax(hz_plot) # max frequency, again
            max_midi = freqToMidi(hz_max) # get midi o

            # run the code to explain what function the max pitch was
            code, cur_midi = timewise.explain(max_midi, start_seconds, end_seconds)

            # if it doesn't know why, cur_midi will be None, set it manually
            if code == Explanation.UNKNOWN:
                cur_midi = max_midi

            # if we did find it
            if cur_midi in found_midi:
                # if we have a lower code, keep it
                if code.value < found_midi[cur_midi].value:
                    found_midi[cur_midi] = code
                continue # we've already found it.

            # if we're still going (hasn't been found before), save the code
            found_midi[cur_midi] = code

            # subtract the expected FFT samples for cur_midi from the plot
            for overtone in instruments_fft[0][str(cur_midi)]:
                overtone_hz = hz_max * int(overtone)
                # find the max within 10 hz of the expected frequency, in case we're a bit off-center
                local_max = numpy.argmax(hz_plot[overtone_hz - LOCAL_MAX_DISTANCE:overtone_hz + LOCAL_MAX_DISTANCE])
                overtone_hz = overtone_hz - LOCAL_MAX_DISTANCE + local_max
                hz_plot[overtone_hz] -= float(instruments_fft[0][str(cur_midi)][overtone]) * window_length
                
                # smooth out the graph to take care of the buildup to the peaks; makes it slope linearly between SMOOTH_DISTANCE Hz away and the peak
                orig_lower = hz_plot[overtone_hz - SMOOTH_DISTANCE]
                inc_lower = (hz_plot[overtone_hz] - orig_lower) / SMOOTH_DISTANCE
                for adj in range(0, SMOOTH_DISTANCE + 1):
                    hz_plot[overtone_hz + (adj - SMOOTH_DISTANCE)] = orig_lower + (adj * inc_lower)

                orig_upper = hz_plot[overtone_hz + SMOOTH_DISTANCE]
                inc_upper = (hz_plot[overtone_hz] - orig_upper) / SMOOTH_DISTANCE
                for adj in range(0, SMOOTH_DISTANCE + 1): # from -5 to 1
                    hz_plot[overtone_hz + adj] = orig_lower + ((SMOOTH_DISTANCE - adj) * inc_lower)

            if img_debug:
                xf = numpy.linspace(0.0, plot_length, plot_length)
                plt.plot(xf[:1500], hz_plot[:1500], 'r')
                plt.title("Quarter " + str(x))
                plt.savefig('imgout/test' + str(count) + "-" + str(x) + '.png')
                plt.close()

            # else:
            #   found_hz.append(hz_max)
            #   found_midi.append(cur_midi)

    print("For window:", str(count), "(" + str(start_seconds), "to", str(end_seconds) + "): Notes found:", found_midi)

    events[start_point / sample_rate] = found_midi

    start_point += sample_offset
    count += 1

print_explanation_guide()
print("Detected:")
pp.pprint(sorted(events.items(), key=operator.itemgetter(0)))
print("Expected:")
pp.pprint(timewise.offsets)

addTimeline(timewise, mei_file, new_file_stem)