from lxml import etree
import os
import sys
import uuid

import pdb


def genUUID():
    return 'm-' + str(uuid.uuid4())


def appendNewElement(parent, elementType):
    new_element = etree.Element(elementType)
    parent.append(new_element)
    new_element.attrib['{http://www.w3.org/XML/1998/namespace}id'] = genUUID()
    return new_element

with open("salz-test.mei", "r") as f:
    # make it look decent
    parser = etree.XMLParser(remove_blank_text=True)
    tree = etree.parse(f, parser)

    root = tree.getroot()
    root.attrib["meiversion"] = "2013"

    music = root.findall("{http://www.music-encoding.org/ns/mei}music")[0]
    body = music.findall("{http://www.music-encoding.org/ns/mei}body")[0]
    mdiv = body.findall("{http://www.music-encoding.org/ns/mei}mdiv")[0]
    score = mdiv.findall("{http://www.music-encoding.org/ns/mei}score")[0]
    section = score.findall("{http://www.music-encoding.org/ns/mei}section")[0]
    staff = section.findall("{http://www.music-encoding.org/ns/mei}staff")[0]
    old_layer = staff.findall("{http://www.music-encoding.org/ns/mei}layer")[0]

    measure = appendNewElement(section, 'measure')
    measure.append(staff)
    layer = appendNewElement(staff, 'layer')

    for obj in old_layer:
    	if obj.tag == "{http://www.music-encoding.org/ns/mei}neume":
    		for nc in obj.findall("{http://www.music-encoding.org/ns/mei}nc"):
    			for note in nc.findall("{http://www.music-encoding.org/ns/mei}note"):
    				layer.append(note)
    				note.attrib["dur"] = "1"
    				note.attrib["facs"] = obj.attrib["facs"]
    	else:
    		layer.append(obj)

    staff.remove(old_layer)

    tree.write("salz-test-out.mei", pretty_print=True)
