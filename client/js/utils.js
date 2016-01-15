function stringTimeToFloat(time)
{
    var timeSplit = time.split(":");
    return parseFloat(timeSplit[0], 10)*3600 + parseFloat(timeSplit[1], 10)*60 + parseFloat(timeSplit[2]);
}