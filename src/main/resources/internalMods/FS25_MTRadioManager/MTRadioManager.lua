-- FS25_MTRadioManager
-- Built-in companion mod for MT Mod Manager
-- Overrides built-in GIANTS radio stations so in-game playback cycles exclusively through your custom added radio stations.

MTRadioManager = {}
MTRadioManager.overrideBuiltins = true
MTRadioManager.numUserStations = 0
MTRadioManager.isInitialized = false

local function getAppPath()
    if getUserProfileAppPath ~= nil then
        local p = getUserProfileAppPath()
        if p ~= nil and p ~= "" then
            p = string.gsub(p, "\\", "/")
            if not string.find(p, "/$") then
                p = p .. "/"
            end
            return p
        end
    end
    return ""
end

function MTRadioManager:loadConfiguration()
    local appPath = getAppPath()
    local settingsFile = appPath .. "modSettings/MTRadioManager.xml"
    settingsFile = string.gsub(settingsFile, "\\", "/")
    
    if fileExists ~= nil and fileExists(settingsFile) then
        local xml = loadXMLFile("MTRadioSettingsXML", settingsFile)
        if xml ~= nil and xml ~= 0 then
            local val = getXMLBool(xml, "MTRadioSettings.overrideBuiltins")
            if val ~= nil then
                self.overrideBuiltins = val
            end
            delete(xml)
        end
    end

    -- Count user stations in streamingInternetRadios.xml
    local streamFile = appPath .. "music/streamingInternetRadios.xml"
    streamFile = string.gsub(streamFile, "\\", "/")
    self.numUserStations = 0
    if fileExists ~= nil and fileExists(streamFile) then
        local xml = loadXMLFile("MTRadioStreamsXML", streamFile)
        if xml ~= nil and xml ~= 0 then
            local count = 0
            while true do
                local key = string.format("streamingInternetRadios.streamingInternetRadio(%d)#href", count)
                local href = getXMLString(xml, key)
                if href == nil or href == "" then
                    break
                end
                count = count + 1
            end
            self.numUserStations = count
            delete(xml)
        end
    end

    print(string.format("[MTRadioManager] Config loaded: overrideBuiltins=%s, customStationsCount=%d",
        tostring(self.overrideBuiltins), self.numUserStations))
end

function MTRadioManager:isOverrideActive()
    return self.overrideBuiltins and self.numUserStations > 0
end

function MTRadioManager:filterChannels(soundPlayerSelf)
    if soundPlayerSelf == nil or soundPlayerSelf.channels == nil then return end
    if not self:isOverrideActive() then return end
    
    -- If already filtered, ensure currentChannel is within valid 1..#channels bounds
    if soundPlayerSelf.mtFiltered then
        local total = #soundPlayerSelf.channels
        if total > 0 then
            if soundPlayerSelf.currentChannel == nil or soundPlayerSelf.currentChannel < 1 or soundPlayerSelf.currentChannel > total then
                soundPlayerSelf.currentChannel = 1
            end
        end
        return
    end

    local total = #soundPlayerSelf.channels

    -- Strategy 1: Look for channel objects explicitly flagged as streams
    local userChannels = {}
    for idx, ch in ipairs(soundPlayerSelf.channels) do
        if ch ~= nil then
            local isStream = ch.isStream or ch.isStreaming or ch.isInternet or ch.isInternetStream or (ch.url ~= nil and ch.url ~= "") or (ch.streamUrl ~= nil and ch.streamUrl ~= "") or (ch.href ~= nil and ch.href ~= "")
            if isStream then
                table.insert(userChannels, ch)
            end
        end
    end

    if #userChannels > 0 and #userChannels <= self.numUserStations then
        soundPlayerSelf.channels = userChannels
        soundPlayerSelf.mtFiltered = true
        soundPlayerSelf.currentChannel = 1
        print(string.format("[MTRadioManager] Filtered channels by stream property: kept %d custom stations out of %d total", #userChannels, total))
        return
    end

    -- Strategy 2: GIANTS Engine loads 8 built-in stations first, then appends custom user stations.
    -- Wait until total channels >= (8 + numUserStations) so we don't prematurely slice built-in channels before user channels finish loading.
    if self.numUserStations > 0 then
        if total >= (8 + self.numUserStations) or (total > 8 and total >= self.numUserStations) then
            userChannels = {}
            local firstIdx = total - self.numUserStations + 1
            for i = firstIdx, total do
                table.insert(userChannels, soundPlayerSelf.channels[i])
            end
            soundPlayerSelf.channels = userChannels
            soundPlayerSelf.mtFiltered = true
            soundPlayerSelf.currentChannel = 1
            print(string.format("[MTRadioManager] Filtered channels by index offset: kept %d custom stations out of %d total (removed %d built-in stations)", 
                #userChannels, total, total - self.numUserStations))
        end
    end
end

function MTRadioManager:initHooks()
    if self.isInitialized then return end
    self.isInitialized = true

    self:loadConfiguration()

    if SoundPlayer == nil then
        print("[MTRadioManager] SoundPlayer not available.")
        return
    end

    -- Hook initializeSoundPlayer
    if SoundPlayer.initializeSoundPlayer ~= nil then
        local origInit = SoundPlayer.initializeSoundPlayer
        SoundPlayer.initializeSoundPlayer = function(soundPlayerSelf, ...)
            local res = origInit(soundPlayerSelf, ...)
            soundPlayerSelf.mtFiltered = nil
            MTRadioManager:filterChannels(soundPlayerSelf)
            return res
        end
    end

    -- Hook startChannel
    if SoundPlayer.startChannel ~= nil then
        local origStartChannel = SoundPlayer.startChannel
        SoundPlayer.startChannel = function(soundPlayerSelf, channel, ...)
            MTRadioManager:filterChannels(soundPlayerSelf)
            if MTRadioManager:isOverrideActive() and soundPlayerSelf.channels ~= nil and #soundPlayerSelf.channels > 0 then
                local ch = channel or soundPlayerSelf.currentChannel or 1
                if ch < 1 or ch > #soundPlayerSelf.channels then
                    ch = 1
                end
                soundPlayerSelf.currentChannel = ch
                return origStartChannel(soundPlayerSelf, ch, ...)
            end
            return origStartChannel(soundPlayerSelf, channel, ...)
        end
    end

    -- Hook nextChannel
    if SoundPlayer.nextChannel ~= nil then
        local origNext = SoundPlayer.nextChannel
        SoundPlayer.nextChannel = function(soundPlayerSelf, ...)
            MTRadioManager:filterChannels(soundPlayerSelf)
            if MTRadioManager:isOverrideActive() and soundPlayerSelf.channels ~= nil and #soundPlayerSelf.channels > 0 then
                local total = #soundPlayerSelf.channels
                local current = soundPlayerSelf.currentChannel or 0
                local nextCh = current + 1
                if nextCh > total or nextCh < 1 then
                    nextCh = 1
                end
                soundPlayerSelf.currentChannel = nextCh
                if SoundPlayer.startChannel ~= nil then
                    return SoundPlayer.startChannel(soundPlayerSelf, nextCh)
                end
            end
            return origNext(soundPlayerSelf, ...)
        end
    end

    -- Hook previousChannel
    if SoundPlayer.previousChannel ~= nil then
        local origPrev = SoundPlayer.previousChannel
        SoundPlayer.previousChannel = function(soundPlayerSelf, ...)
            MTRadioManager:filterChannels(soundPlayerSelf)
            if MTRadioManager:isOverrideActive() and soundPlayerSelf.channels ~= nil and #soundPlayerSelf.channels > 0 then
                local total = #soundPlayerSelf.channels
                local current = soundPlayerSelf.currentChannel or (total + 1)
                local prevCh = current - 1
                if prevCh < 1 or prevCh > total then
                    prevCh = total
                end
                soundPlayerSelf.currentChannel = prevCh
                if SoundPlayer.startChannel ~= nil then
                    return SoundPlayer.startChannel(soundPlayerSelf, prevCh)
                end
            end
            return origPrev(soundPlayerSelf, ...)
        end
    end

    -- Hook play
    if SoundPlayer.play ~= nil then
        local origPlay = SoundPlayer.play
        SoundPlayer.play = function(soundPlayerSelf, ...)
            MTRadioManager:filterChannels(soundPlayerSelf)
            if MTRadioManager:isOverrideActive() and soundPlayerSelf.channels ~= nil and #soundPlayerSelf.channels > 0 then
                local total = #soundPlayerSelf.channels
                if soundPlayerSelf.currentChannel == nil or soundPlayerSelf.currentChannel < 1 or soundPlayerSelf.currentChannel > total then
                    soundPlayerSelf.currentChannel = 1
                    if SoundPlayer.startChannel ~= nil then
                        SoundPlayer.startChannel(soundPlayerSelf, 1)
                        return
                    end
                end
            end
            return origPlay(soundPlayerSelf, ...)
        end
    end

    -- Hook update if available
    if SoundPlayer.update ~= nil then
        local origUpdate = SoundPlayer.update
        SoundPlayer.update = function(soundPlayerSelf, ...)
            MTRadioManager:filterChannels(soundPlayerSelf)
            return origUpdate(soundPlayerSelf, ...)
        end
    end

    print("[MTRadioManager] SoundPlayer radio hooks initialized successfully.")
end

function MTRadioManager:loadMap(mapName)
    self:loadConfiguration()
    if g_soundPlayer ~= nil then
        MTRadioManager:filterChannels(g_soundPlayer)
    end
end

-- Register mod event listener so loadMap triggers on map load
addModEventListener(MTRadioManager)

-- Immediately initialize hooks
MTRadioManager:initHooks()


