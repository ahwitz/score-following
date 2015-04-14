# python native imports
from __future__ import division
from subprocess import call, Popen
import operator
from math import ceil, floor, log

# downloaded imports
from music21 import *
import numpy
from scipy.io import wavfile
from scipy.fftpack import fft

# my code
from midi_fourier import *
from s_f_utils import *

# debugging
import pprint
import pdb

MAX_FREQ = 300000000
SMOOTH_DISTANCE = 5
LOCAL_MAX_DISTANCE = 10
wav_debug = False
img_debug = False

if img_debug:
    import matplotlib.pyplot as plt

print "Loading file."
# mei_file = "two-voice.mei" 
# stem = "two-voice"
mei_file = "salz-test-out.mei"
stem = 'salz-test-out'
pp = pprint.PrettyPrinter(indent=4)

# data to pull in from music21
tempo = 0
instruments = [] # list of MIDI program numbers
instruments_fft = {} # eventually, fft data archived by midi_fourier.py

parsed = converter.parseFile(mei_file, None, 'mei', True)
timewise = timewiseMusic21(parsed)
tempo = timewise.tempo
# tempos = [z.secondsPerQuarter() for x, y, z in p.metronomeMarkBoundaries()] # I think this is when the piece has multiple tempos... I should comment my code better.


# write the midi, convert it to wav using Timidity
parsed.write('midi', stem + '.midi')
fp = open(stem + ".wav", "w")
p1 = Popen(["timidity", stem + ".midi", "-Ow"], stdout=fp)
wait = p1.wait() #async, make sure file is completely done
fp.close()

# load the pre-parsed instrument data
for part in parsed[1:]: # parsed[0] is metadata; we don't want that
    # TODO: have it parse new instruments if it doesn't have it stored yet, also keep track of what soundfont/MIDI library has been parsed, if this changes redo them
    this_instrument = part[0].getInstrument(returnDefault = True).midiProgram or 0 # it's part of the measure object (part[0]) for some reason; if it's None we just want 0 (piano)
    instruments.append(this_instrument) 
    instruments_fft[this_instrument] = loadInstrument(this_instrument) # from midi_fourier.py

# reload the wav, get the first track
print "Reading wav."
sample_rate, data = wavfile.read(stem + '.wav')
first_track = data.T[0] # first channel

# chop off the spare -1 frames at the end
audible_length = len(first_track) - 1
while first_track[audible_length] == -1:
    audible_length -= 1

# setting various variables that will be used later
seconds = audible_length / sample_rate
# quarters = int(floor(seconds / tempo)) # quarter notes in the piece, only used for window_length
window_length = sample_rate # floor(audible_length / quarters)
sample_offset = int(floor(audible_length / (seconds / tempo)))
plot_length = min(window_length / 2, MAX_FREQ) # window_length/2 because the fourier plot is mirrored
window_seconds = window_length / sample_rate 

# pp.pprint(sorted(timewise.items(), key=operator.itemgetter(0)))
print "Writing with", window_length, "frame window size: "
lastMidi = -1
start_point = 0
count = 0
events = {}
while start_point < audible_length: 
    # start_point is bumped up at the end of the loop
    end_point = start_point + window_length
    if end_point > audible_length:  # just in case
        break

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
    hz_plot = [None] * int(ceil(normToHz(plot_length, window_seconds)))
    idx = 0
    for y in yf:
        hz = int(normToHz(idx, window_seconds))
        if hz_plot[hz] == None:
            hz_plot[hz] = [y]
        else:
            hz_plot[hz].append(y)
        idx += 1

    # if window_length > sample_rate, this will average everything that resolves to the same frequency, otherwise it condenses int arrays of length 1 to ints
    idx = 0
    for arr in hz_plot:
        if arr == None:
            idx += 1
            continue
        else:
            hz_plot[idx] = sum(arr) / len(arr)
            idx += 1

    print "\nFor quarter:", str(count), "(" + str(start_seconds), "to", str(end_seconds) + ")"

    # print the fourier graph if desired
    if img_debug:
        xf = numpy.linspace(0.0, plot_length, plot_length)
        plt.plot(xf[:1500], hz_plot[:1500], 'r')
        plt.title("Quarter " + str(count))
        plt.savefig('imgout/test' + str(count) + '.png')
        plt.close()

    found_midi = {}

    # TODO: FUCKIN MAKE THIS BETTER
    for x in range(0, 10):
        hz_max = numpy.argmax(hz_plot)
        max_midi = freqToMidi(hz_max) # get midi of it
        #hz_plot[hz_max] = 0 # flip this to 0 so it's not max anymore

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
        for overtone in instruments_fft[71][str(cur_midi)]:
            overtone_hz = hz_max * int(overtone)
            # find the max within 10 hz of the expected frequency, in case we're a bit off-center
            local_max = numpy.argmax(hz_plot[overtone_hz - LOCAL_MAX_DISTANCE:overtone_hz + LOCAL_MAX_DISTANCE])
            overtone_hz = overtone_hz - LOCAL_MAX_DISTANCE + local_max
            hz_plot[overtone_hz] -= float(instruments_fft[71][str(cur_midi)][overtone]) * window_length
            
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

    print "\tNotes found:", found_midi

    events[start_point / sample_rate] = found_midi

    start_point += sample_offset
    count += 1

print_explanation_guide()
print "Detected:"
pp.pprint(sorted(events.items(), key=operator.itemgetter(0)))
print "Expected:"
pp.pprint(timewise.offsets)

addTimeline(timewise, mei_file, stem)