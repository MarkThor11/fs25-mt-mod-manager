-- FS25_MTRadioManager
-- Built-in companion mod for MT Mod Manager
-- Overrides built-in GIANTS radio stations so in-game playback cycles exclusively through your custom added radio stations.

MTRadioManager = {}
MTRadioManager.overrideBuiltins = true
MTRadioManager.numUserStations = 0
MTRadioManager.firstUserChannel = 9
MTRadioManager.lastUserChannel = 9
MTRadioManager.isInitialized = false
MTRadioManager.lastChannel = nil

local function getAppPath()
    if getUserProfileAppPath ~= nil then
        local p = getUserProfileAppPath()
        if p ~= nil and p ~= "" then
            if not string.find(p, "[/\\]$") then
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

    self.firstUserChannel = 9
    self.lastUserChannel = self.firstUserChannel + math.max(0, self.numUserStations - 1)

    print(string.format("[MTRadioManager] Config loaded: overrideBuiltins=%s, customStationsCount=%d (channels %d-%d)",
        tostring(self.overrideBuiltins), self.numUserStations, self.firstUserChannel, self.lastUserChannel))
end

function MTRadioManager:isOverrideActive()
    return self.overrideBuiltins and self.numUserStations > 0
end

function MTRadioManager:clampOrWrapChannel(channel, movingForward)
    if not self:isOverrideActive() then
        return channel
    end

    if channel < self.firstUserChannel or channel > self.lastUserChannel then
        if movingForward then
            return self.firstUserChannel
        else
            return self.lastUserChannel
        end
    end

    return channel
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
            if MTRadioManager:isOverrideActive() then
                soundPlayerSelf.currentChannel = MTRadioManager.firstUserChannel
            end
            return res
        end
    end

    -- Hook startChannel
    if SoundPlayer.startChannel ~= nil then
        local origStartChannel = SoundPlayer.startChannel
        SoundPlayer.startChannel = function(soundPlayerSelf, ...)
            if MTRadioManager:isOverrideActive() then
                local ch = soundPlayerSelf.currentChannel
                if ch == nil or ch < MTRadioManager.firstUserChannel or ch > MTRadioManager.lastUserChannel then
                    local isForward = (MTRadioManager.lastChannel == nil or ch == nil or ch > MTRadioManager.lastChannel)
                    ch = MTRadioManager:clampOrWrapChannel(ch or MTRadioManager.firstUserChannel, isForward)
                    soundPlayerSelf.currentChannel = ch
                end
                MTRadioManager.lastChannel = soundPlayerSelf.currentChannel
            end
            return origStartChannel(soundPlayerSelf, ...)
        end
    end

    -- Hook nextChannel
    if SoundPlayer.nextChannel ~= nil then
        local origNext = SoundPlayer.nextChannel
        SoundPlayer.nextChannel = function(soundPlayerSelf, ...)
            if MTRadioManager:isOverrideActive() then
                local current = soundPlayerSelf.currentChannel or (MTRadioManager.firstUserChannel - 1)
                local nextCh = current + 1
                if nextCh > MTRadioManager.lastUserChannel or nextCh < MTRadioManager.firstUserChannel then
                    nextCh = MTRadioManager.firstUserChannel
                end
                soundPlayerSelf.currentChannel = nextCh
                MTRadioManager.lastChannel = nextCh
                if SoundPlayer.startChannel ~= nil then
                    return SoundPlayer.startChannel(soundPlayerSelf)
                end
            end
            return origNext(soundPlayerSelf, ...)
        end
    end

    -- Hook previousChannel
    if SoundPlayer.previousChannel ~= nil then
        local origPrev = SoundPlayer.previousChannel
        SoundPlayer.previousChannel = function(soundPlayerSelf, ...)
            if MTRadioManager:isOverrideActive() then
                local current = soundPlayerSelf.currentChannel or (MTRadioManager.lastUserChannel + 1)
                local prevCh = current - 1
                if prevCh < MTRadioManager.firstUserChannel or prevCh > MTRadioManager.lastUserChannel then
                    prevCh = MTRadioManager.lastUserChannel
                end
                soundPlayerSelf.currentChannel = prevCh
                MTRadioManager.lastChannel = prevCh
                if SoundPlayer.startChannel ~= nil then
                    return SoundPlayer.startChannel(soundPlayerSelf)
                end
            end
            return origPrev(soundPlayerSelf, ...)
        end
    end

    -- Hook play / toggle
    if SoundPlayer.play ~= nil then
        local origPlay = SoundPlayer.play
        SoundPlayer.play = function(soundPlayerSelf, ...)
            if MTRadioManager:isOverrideActive() then
                if soundPlayerSelf.currentChannel == nil or soundPlayerSelf.currentChannel < MTRadioManager.firstUserChannel or soundPlayerSelf.currentChannel > MTRadioManager.lastUserChannel then
                    soundPlayerSelf.currentChannel = MTRadioManager.firstUserChannel
                    MTRadioManager.lastChannel = MTRadioManager.firstUserChannel
                    if SoundPlayer.startChannel ~= nil then
                        SoundPlayer.startChannel(soundPlayerSelf)
                        return
                    end
                end
            end
            return origPlay(soundPlayerSelf, ...)
        end
    end

    print("[MTRadioManager] SoundPlayer radio hooks initialized successfully.")
end

-- Immediately initialize hooks
MTRadioManager:initHooks()
