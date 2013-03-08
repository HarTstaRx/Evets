var tracker = undefined;

/*
Embedded Video Events Tracking System
Version: 1.1
Author: David Díez Samaniego (david.diez.samaniego [at] gmail [dot] com)
*/
//@[timeFrames] Time gaps where we are interested to track the video events. Optional
var VideoTracker = function(timeFrames)
{
    //Support scope
    var self = this;
    
    //If we get new time ranges to frame new events we use them
    if(timeFrames && timeFrames instanceof Array)
        this.timeFrames = timeFrames;
    else
        this.timeFrames = this._Default_Timeframes;
    
    //Video iframes array
    this.iframes = [];

    //Youtube player internal objects array
    this.videos = [];

    //setInterval loop ID for UpdateTimer function
    this.UpdateIntervalCode = -1;
    
    //Gets the time gap between param @time is at
    //@(time) time in seconds
    this.getTimeFrame = function(time)
    {
        var timeFrames = this.timeFrames.slice(0);
        for(var i = 0; i < timeFrames.length; i++)
        {
            if(time < timeFrames[i])
            {
                if(i == 0)
                    return "0-" + timeFrames[i];
                else
                    return (timeFrames[i-1] + "-" + (timeFrames[i] - 1));
            }
        }
        //If the time doesn't fit in any of the time gaps, it returns the last gap and the current time
        return timeFrames[timeFrames.length - 1] + "-" + time;
    };
    
    //Search for iframes on the page with a src from youtube and gathers basic data, jQuery needed
    this.RegisterVideos = function()
    {
        jQuery('iframe').each(function(index, element)
        {
            var videoUrl = element.getAttribute('src');
            //If the source of the video matches this regular expression means that the video is from youtube...
            var regexpResult = videoUrl.match("(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/.{1,}\/\?v=|\/user\/.{1,}\/|\/v\/|\/watch\\?v=))([^&#]*)");
            var videoId = (regexpResult == null) ? null : regexpResult[1];
            
            //If not, the video is not from youtube
            if(!videoId) return;
            
            element.id = videoId;
            //...and goes right into the iframes array
            self.iframes[index] = element;
        });
    };
    
    //Registers an event on the Google Analitycs event tracking system
    //@(videoId) Event Category, we currently use the video title or the video Id for ease of reading
    //@(playerState) Event Action, usually the video state (eg Playing, Paused, Ended...)
    //@(timeGap) Event Label, the time frame where the video is at this moment (eg if the video is at 2min30sec (=470sec) the timeGap by default will be [180-599])
    //@(position) Event Value, the position where the video is at this time
    //All the parameters are mandatory
    //Event Category, Action, Label & Value are concepts from Google Analytics API, for more info on this, please visit GA API Event tracking documentation
    this.RegisterEvent = function(videoId, playerState, timeGap, position)
    {
        var player = self.videos[videoId];
        
        //_gaq.push works the same way, but asynchronously
        //_gaq.push(['_trackEvent', videoId, playerState, timeGap, position ]);
  	position = Math.round(position);
        _gat._getTrackerByName()._trackEvent(videoId, playerState, timeGap, position);
		
        //This line is for debugging purpouses, it can be safely commented/deleted
        console.log("[" + videoId + "] " +  playerState + " " + timeGap + " value: " + position);
    };
    
    //Triggered when a video has changed its state
    //@event is the object passed, it has 2 objects: target (the internal youtube player object) and data (the current player state, Integer)
    this.OnStateChanged = function(event)
    {
        //If the state doesn't fit in any of the following states, by default its state will be 'Ready'
        var state = "Ready";
        var player = event.target;

        //getCurrentTime is a method from the youtube player internal object, and returns the position where the player was
        var position = player.getCurrentTime();
        switch(event.data)
        {
            case YT.PlayerState.PLAYING:
                state = "Playing";
                break;
            case YT.PlayerState.ENDED:
                state = "End of Video";
                break;
            case YT.PlayerState.PAUSED:
                state = "Paused";
                break;
            case YT.PlayerState.BUFFERING:
                state = "Buffering";
                break;
            case YT.PlayerState.CUED:
                state = "Cued";
                break;
        }
        
        //Buffering and repeated states will be ignored
        if(event.data == YT.PlayerState.BUFFERING || state == player.lastState) return;
        
        //The current state gets saved as the last one
        player.lastState = state;
        
        //Calculates the time frame of the current position and sends the event to Google Analytics
        var timeGap = self.getTimeFrame(position);
        self.RegisterEvent(player.getIframe().getAttribute('data-title'), state, timeGap, position);

        //The current poisition gets saved as the last one
        player.lastPosition = position;
    };
    
    //Looped method that checks if the playing videos have move to a different time gap from their previous time gaps
    this.UpdateTimer = function()
    {
        var position, player, timeGap;
        for(var i = 0; i < tracker.iframes.length; i++)
        {
            player = tracker.videos[tracker.iframes[i].id];
            position = player.getCurrentTime();
            player.lastPosition = position;
            
            //If the current position is higher than its highest the proceeds
            if(position > player.maxTime)
                player.maxTime = position;
            
            //getPlayerState is a function of the youtube player internal object
            if(player.getPlayerState() == YT.PlayerState.PLAYING)
            {
                timeGap = tracker.getTimeFrame(position);
                if(timeGap != player.lastTimeGap)
                {
                    //The new time range is sended to Google Analytics with the 'view-range' action name
                    tracker.RegisterEvent(tracker.iframes[i].getAttribute('data-title'), "view-range", timeGap, position);

                    //Finally the new time gap gets saved as the last one
                    player.lastTimeGap = timeGap;
                }
            }
        }
    };
    
    //Registers in GA the highest time recorded for each video, function intented to be hooked to something (eg DOM event, button...)
    this.RegisterMaxTime = function()
    {
        var timeGap, state, player;
        for(var i = 0; i < tracker.iframes.length; i++)
        {
            player = tracker.videos[tracker.iframes[i].id];
            timeGap = tracker.getTimeFrame(player.maxTime);
            //The highest time recorded is sended to GA with the 'max-time' action name
            tracker.RegisterEvent(tracker.iframes[i].getAttribute('data-title'), "max-time", timeGap, player.maxTime);
        }
    };
};

//Object prototype
VideoTracker.prototype =
{
    constructor: VideoTracker,
    
    //Default time gaps where we are interested to track the video events
    //If overrrided: be aware of having a last gap for large videos
    _Default_Timeframes: [10, 30, 60, 180, 600, 999999999]
};

//Event launched when the iframe youtube API is loaded, our object MUST be instantiated and RegisterVideos MUST be called
function onYouTubeIframeAPIReady()
{
    //Loops througt the youtube iframes of the page
    for (var i = 0; i < tracker.iframes.length; i++)
    {
        var iframe = tracker.iframes[i];
        //Here it creates the Youtube player internal object
        //@(iframe) The video iframe
        //@[params] Optional parameters, heere it hooks the onStateChange event to our listener 'OnStateChanged'
        var player = new YT.Player(iframe, {
            events:
            {
                //Be aware of the instanced object name, by default it is 'tracker' but it can change and it MUST be changed here too
                'onStateChange': tracker.OnStateChanged
            }
        });
        //Register all the variables for further usage
        player.maxTime = 0;
        player.lastPosition = 0;
        player.lastPositionPaused = 0;
        player.lastTimeGap = undefined;
        player.seekTimeout = 0;
        
        //The Youtube player internal object gets saved into the tracker object, its index will be the youtube video ID
        //Be aware of the instanced object name, by default it is 'tracker' but it can change and it MUST be changed here too
        tracker.videos[iframe.id] = player;
        
        //Usage of the Youtube API to get the video title for further usage, jQuery needed
        jQuery.ajax({
            url: "https://gdata.youtube.com/feeds/api/videos/" + iframe.id + "?v=2&alt=json",
            success: function(data)
            {
				if(jQuery.parseJSON(data)) data = jQuery.parseJSON(data);
				
                var id = data.entry.id.$t.match("video:.{1,}")[0].replace("video:", "");
                //The title gets saved into the iframe as a custom attribute 'data-title'
                document.getElementById(id).setAttribute('data-title', data.entry.title.$t);
            }
        });
    }
    
	jQuery(document).load(function()
    {
		tracker = new VideoTracker();
		tracker.RegisterVideos();
		
        //Setting the timer interval where the Update Timer gets triggered
        tracker.UpdateIntervalCode = setInterval(tracker.UpdateTimer, 500);
    });
}
