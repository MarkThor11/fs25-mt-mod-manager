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

function MTRadioManager:updateChannelBounds(soundPlayerSelf)
    if soundPlayerSelf ~= nil and soundPlayerSelf.channels ~= nil and #soundPlayerSelf.channels > 0 then
        local total = #soundPlayerSelf.channels
        if self.numUserStations > 0 and total >= self.numUserStations then
            self.firstUserChannel = total - self.numUserStations + 1
            self.lastUserChannel = total
        end
    end
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
                MTRadioManager:updateChannelBounds(soundPlayerSelf)
                soundPlayerSelf.currentChannel = MTRadioManager.firstUserChannel
            end
            return res
        end
    end

    -- Hook startChannel
    if SoundPlayer.startChannel ~= nil then
        local origStartChannel = SoundPlayer.startChannel
        SoundPlayer.startChannel = function(soundPlayerSelf, channel, ...)
            if MTRadioManager:isOverrideActive() then
                MTRadioManager:updateChannelBounds(soundPlayerSelf)
                local ch = channel or soundPlayerSelf.currentChannel
                if ch == nil or ch < MTRadioManager.firstUserChannel or ch > MTRadioManager.lastUserChannel then
                    local isForward = (MTRadioManager.lastChannel == nil or ch == nil or ch > MTRadioManager.lastChannel)
                    ch = MTRadioManager:clampOrWrapChannel(ch or MTRadioManager.firstUserChannel, isForward)
                end
                soundPlayerSelf.currentChannel = ch
                MTRadioManager.lastChannel = ch
                return origStartChannel(soundPlayerSelf, ch, ...)
            end
            return origStartChannel(soundPlayerSelf, channel, ...)
        end
    end

    -- Hook nextChannel
    if SoundPlayer.nextChannel ~= nil then
        local origNext = SoundPlayer.nextChannel
        SoundPlayer.nextChannel = function(soundPlayerSelf, ...)
            if MTRadioManager:isOverrideActive() then
                MTRadioManager:updateChannelBounds(soundPlayerSelf)
                local current = soundPlayerSelf.currentChannel or (MTRadioManager.firstUserChannel - 1)
                local nextCh = current + 1
                if nextCh > MTRadioManager.lastUserChannel or nextCh < MTRadioManager.firstUserChannel then
                    nextCh = MTRadioManager.firstUserChannel
                end
                soundPlayerSelf.currentChannel = nextCh
                MTRadioManager.lastChannel = nextCh
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
            if MTRadioManager:isOverrideActive() then
                MTRadioManager:updateChannelBounds(soundPlayerSelf)
                local current = soundPlayerSelf.currentChannel or (MTRadioManager.lastUserChannel + 1)
                local prevCh = current - 1
                if prevCh < MTRadioManager.firstUserChannel or prevCh > MTRadioManager.lastUserChannel then
                    prevCh = MTRadioManager.lastUserChannel
                end
                soundPlayerSelf.currentChannel = prevCh
                MTRadioManager.lastChannel = prevCh
                if SoundPlayer.startChannel ~= nil then
                    return SoundPlayer.startChannel(soundPlayerSelf, prevCh)
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
                MTRadioManager:updateChannelBounds(soundPlayerSelf)
                if soundPlayerSelf.currentChannel == nil or soundPlayerSelf.currentChannel < MTRadioManager.firstUserChannel or soundPlayerSelf.currentChannel > MTRadioManager.lastUserChannel then
                    soundPlayerSelf.currentChannel = MTRadioManager.firstUserChannel
                    MTRadioManager.lastChannel = MTRadioManager.firstUserChannel
                    if SoundPlayer.startChannel ~= nil then
                        SoundPlayer.startChannel(soundPlayerSelf, MTRadioManager.firstUserChannel)
                        return
                    end
                end
            end
            return origPlay(soundPlayerSelf, ...)
        end
    end

    print("[MTRadioManager] SoundPlayer radio hooks initialized successfully.")
    
    self:checkAutoNavigation()
    self:setupAutoNavigationHooks()
end

MTRadioManager.targetNavScreen = nil
MTRadioManager.hasNavigated = false

function MTRadioManager:checkAutoNavigation()
    local appPath = getAppPath()
    local navFile = appPath .. "modSettings/MTMultiplayerNavigation.xml"
    
    if fileExists ~= nil and fileExists(navFile) then
        local xml = loadXMLFile("MTNavXML", navFile)
        if xml ~= nil and xml ~= 0 then
            local target = getXMLString(xml, "MTMultiplayerNavigation.targetScreen")
            delete(xml)
            
            if target ~= nil and target ~= "" and target ~= "NONE" then
                self.targetNavScreen = target
                print("[MTRadioManager] MultiPlayer Auto-Navigation target found: " .. tostring(target))
                
                -- Reset the XML file so it doesn't trigger on subsequent menu visits
                local resetXml = '<?xml version="1.0" encoding="utf-8" ?>\n<MTMultiplayerNavigation>\n  <targetScreen>NONE</targetScreen>\n</MTMultiplayerNavigation>'
                local f = io.open(navFile, "w")
                if f then
                    f:write(resetXml)
                    f:close()
                end
            end
        end
    end
end

function MTRadioManager:setupAutoNavigationHooks()
    local function executeNav(screenSelf)
        if MTRadioManager.targetNavScreen ~= nil and not MTRadioManager.hasNavigated then
            MTRadioManager.hasNavigated = true
            local target = MTRadioManager.targetNavScreen
            print("[MTRadioManager] Auto-navigating MP menu to: " .. tostring(target))
            
            if target == "CREATE_GAME" then
                if screenSelf.onClickCreateGame ~= nil then
                    screenSelf:onClickCreateGame()
                elseif screenSelf.onClickCreate ~= nil then
                    screenSelf:onClickCreate()
                elseif screenSelf.onClickHost ~= nil then
                    screenSelf:onClickHost()
                elseif screenSelf.boxCreate ~= nil and screenSelf.boxCreate.onClick ~= nil then
                    screenSelf.boxCreate:onClick()
                end
            elseif target == "JOIN_GAME" then
                if screenSelf.onClickJoinGame ~= nil then
                    screenSelf:onClickJoinGame()
                elseif screenSelf.onClickJoin ~= nil then
                    screenSelf:onClickJoin()
                elseif screenSelf.boxJoin ~= nil and screenSelf.boxJoin.onClick ~= nil then
                    screenSelf.boxJoin:onClick()
                end
            end
        end
    end

    if MPMenu ~= nil then
        local origOnOpen = MPMenu.onOpen
        MPMenu.onOpen = function(self, ...)
            if origOnOpen ~= nil then origOnOpen(self, ...) end
            executeNav(self)
        end
    end

    if MultiplayerScreen ~= nil then
        local origOnOpen = MultiplayerScreen.onOpen
        MultiplayerScreen.onOpen = function(self, ...)
            if origOnOpen ~= nil then origOnOpen(self, ...) end
            executeNav(self)
        end
    end

    if MainMenu ~= nil then
        local origOnOpen = MainMenu.onOpen
        MainMenu.onOpen = function(self, ...)
            if origOnOpen ~= nil then origOnOpen(self, ...) end
            executeNav(self)
        end
    end
end

function MTRadioManager:loadMap(mapName)
    self:loadConfiguration()
end

-- Register mod event listener so loadMap triggers on map load
addModEventListener(MTRadioManager)

-- Immediately initialize hooks
MTRadioManager:initHooks()
