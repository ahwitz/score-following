function stringTimeToFloat(time)
{
    var timeSplit = time.split(":");
    return parseInt(timeSplit[0], 10)*3600 + parseInt(timeSplit[1], 10)*60 + parseFloat(timeSplit[2]);
}