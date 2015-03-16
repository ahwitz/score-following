from music21 import *
from subprocess import call, Popen

print "\n\n\n\n" # to separate from music21 printouts
meiFile = "CF-028-music.mei"
stem = 'cf-028'

p = converter.parseFile('salzinnes/mei/' + meiFile, None, 'mei', True)
p.write('midi', stem + '.midi')
fp = open(stem + ".wav", "w")
p1 = Popen(["timidity", stem + ".midi", "-Ow"], stdout=fp)
fp.close()

# p = converter.parseFile('large-ensemble/gluck.mei', None, 'mei', True)
# p.write('midi', 'large-ensemble/gluck.midi')