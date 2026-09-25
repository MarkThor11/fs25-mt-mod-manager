-- FS25_MTRadioManager
-- Built-in companion mod for MT Mod Manager
-- Overrides built-in GIANTS radio stations and applies custom station replacement titles.

MTRadioManager = {}
MTRadioManager.overrideBuiltins = true
MTRadioManager.numUserStations = 0
MTRadioManager.customNames = {} -- href -> replacement name mapping
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

    -- Parse user stations & replacement titles in streamingInternetRadios.xml
    local streamFile = appPath .. "music/streamingInternetRadios.xml"
    streamFile = string.gsub(streamFile, "\\", "/")
    self.numUserStations = 0
    self.customNames = {}

    if fileExists ~= nil and fileExists(streamFile) then
        local xml = loadXMLFile("MTRadioStreamsXML", streamFile)
        if xml ~= nil and xml ~= 0 then
            local count = 0
            while true do
                local keyHref = string.format("streamingInternetRadios.streamingInternetRadio(%d)#href", count)
                local href = getXMLString(xml, keyHref)
                if href == nil or href == "" then
                    break
                end

                local keyRepl = string.format("streamingInternetRadios.streamingInternetRadio(%d)#replacement", count)
                local replacement = getXMLString(xml, keyRepl)
                if replacement ~= nil and replacement ~= "" then
                    self.customNames[href] = replacement
                    -- Also store normalized href without trailing slash or semicolon
                    local norm = string.gsub(href, ";$", "")
                    norm = string.gsub(norm, "/$", "")
                    self.customNames[norm] = replacement
                end

                count = count + 1
            end
            self.numUserStations = count
            delete(xml)
        end
    end

    print(string.format("[MTRadioManager] Config loaded: overrideBuiltins=%s, customStationsCount=%d, customNamesCount=%d",
        tostring(self.overrideBuiltins), self.numUserStations, TableUtils ~= nil and TableUtils.size(self.customNames) or 0))
end

function MTRadioManager:isOverrideActive()
    return self.overrideBuiltins
end

function MTRadioManager:applyCustomNamesToPlayer(playerSelf)
    if playerSelf == nil or playerSelf.channels == nil then return end
    for idx, ch in ipairs(playerSelf.channels) do
        if ch ~= nil then
            local urlStr = tostring(ch.url or ch.streamUrl or ch.href or ch.filename or ch.path or "")
            local norm = string.gsub(urlStr, ";$", "")
            norm = string.gsub(norm, "/$", "")

            local customTitle = self.customNames[urlStr] or self.customNames[norm]
            if customTitle ~= nil and customTitle ~= "" then
                ch.name = customTitle
                ch.replacement = customTitle
                ch.title = customTitle
                ch.stationName = customTitle
            end
        end
    end
end

function MTRadioManager:filterChannels(playerSelf)
    if playerSelf == nil or playerSelf.channels == nil then return end
    
    -- Always apply custom title overrides to active channels
    self:applyCustomNamesToPlayer(playerSelf)

    if not self.overrideBuiltins then return end
    
    if playerSelf.rawChannels == nil or #playerSelf.rawChannels < #playerSelf.channels then
        playerSelf.rawChannels = playerSelf.channels
    end

    local raw = playerSelf.rawChannels or playerSelf.channels
    local totalRaw = #raw

    if playerSelf.mtFiltered and playerSelf.mtLastRawCount == totalRaw then
        return
    end

    print(string.format("[MTRadioManager] Filtering radio channels from %d raw channels...", totalRaw))

    local userChannels = {}
    for idx, ch in ipairs(raw) do
        if ch ~= nil then
            local isStream = false
            if ch.isStream or ch.isStreaming or ch.isInternet or ch.isInternetStream or ch.isWebStream then
                isStream = true
            end
            local urlStr = tostring(ch.url or ch.streamUrl or ch.href or ch.filename or ch.path or "")
            if string.find(urlStr, "^http://") or string.find(urlStr, "^https://") then
                isStream = true
            end
            if not isStream and (ch.tracks == nil or (type(ch.tracks) == "table" and #ch.tracks == 0)) then
                if ch.name ~= nil and ch.name ~= "" and (ch.url ~= nil or ch.href ~= nil or ch.streamUrl ~= nil) then
                    isStream = true
                end
            end

            if isStream then
                -- Apply title override directly to channel object
                local norm = string.gsub(urlStr, ";$", "")
                norm = string.gsub(norm, "/$", "")
                local customTitle = self.customNames[urlStr] or self.customNames[norm]
                if customTitle ~= nil and customTitle ~= "" then
                    ch.name = customTitle
                    ch.replacement = customTitle
                    ch.title = customTitle
                    ch.stationName = customTitle
                end

                table.insert(userChannels, ch)
                print(string.format("[MTRadioManager] Custom stream #%d: '%s' (%s)", #userChannels, tostring(ch.name or "Unnamed"), urlStr))
            end
        end
    end

    if #userChannels > 0 then
        playerSelf.channels = userChannels
        playerSelf.mtFiltered = true
        playerSelf.mtLastRawCount = totalRaw
        if playerSelf.currentChannel == nil or playerSelf.currentChannel < 1 or playerSelf.currentChannel > #userChannels then
            playerSelf.currentChannel = 1
        end
        print(string.format("[MTRadioManager] Kept %d custom stream channels out of %d raw channels.", #userChannels, totalRaw))
        return
    end

    -- Fallback: slice custom streams from bottom if detector missed flags
    if self.numUserStations > 0 and totalRaw >= self.numUserStations then
        userChannels = {}
        local firstIdx = totalRaw - self.numUserStations + 1
        for i = firstIdx, totalRaw do
            local ch = raw[i]
            if ch ~= nil then
                local urlStr = tostring(ch.url or ch.streamUrl or ch.href or ch.filename or ch.path or "")
                local norm = string.gsub(urlStr, ";$", "")
                norm = string.gsub(norm, "/$", "")
                local customTitle = self.customNames[urlStr] or self.customNames[norm]
                if customTitle ~= nil and customTitle ~= "" then
                    ch.name = customTitle
                    ch.replacement = customTitle
                    ch.title = customTitle
                    ch.stationName = customTitle
                end
                table.insert(userChannels, ch)
            end
        end
        playerSelf.channels = userChannels
        playerSelf.mtFiltered = true
        playerSelf.mtLastRawCount = totalRaw
        if playerSelf.currentChannel == nil or playerSelf.currentChannel < 1 or playerSelf.currentChannel > #userChannels then
            playerSelf.currentChannel = 1
        end
        print(string.format("[MTRadioManager] Sliced last %d channels out of %d total.", #userChannels, totalRaw))
        return
    end

    if self.overrideBuiltins then
        playerSelf.channels = {}
        playerSelf.mtFiltered = true
        playerSelf.mtLastRawCount = totalRaw
        playerSelf.currentChannel = 1
        print("[MTRadioManager] Suppressed all built-in radio channels.")
    end
end

function MTRadioManager:hookClass(className, classObj)
    if classObj == nil then return end
    print(string.format("[MTRadioManager] Inspecting class '%s'...", className))

    local function wrapMethod(methodName)
        if classObj[methodName] ~= nil and type(classObj[methodName]) == "function" then
            local orig = classObj[methodName]
            classObj[methodName] = function(selfObj, ...)
                MTRadioManager:filterChannels(selfObj)

                if methodName == "getChannelName" or methodName == "getItemName" then
                    local chIdx = select(1, ...) or (selfObj ~= nil and selfObj.currentChannel) or 1
                    if selfObj ~= nil and selfObj.channels ~= nil and selfObj.channels[chIdx] ~= nil then
                        local ch = selfObj.channels[chIdx]
                        if ch.name ~= nil and ch.name ~= "" then
                            return ch.name
                        end
                    end
                end

                if MTRadioManager:isOverrideActive() and selfObj ~= nil and selfObj.channels ~= nil then
                    local total = #selfObj.channels
                    if total == 0 then
                        if selfObj.stop ~= nil then selfObj:stop() end
                        return
                    end
                    if methodName == "startChannel" or methodName == "setChannel" or methodName == "playChannel" then
                        local arg1 = select(1, ...)
                        local ch = arg1 or selfObj.currentChannel or 1
                        if type(ch) ~= "number" or ch < 1 or ch > total then ch = 1 end
                        selfObj.currentChannel = ch
                        return orig(selfObj, ch, select(2, ...))
                    elseif methodName == "nextChannel" then
                        local curr = selfObj.currentChannel or 0
                        local nextCh = curr + 1
                        if nextCh > total or nextCh < 1 then nextCh = 1 end
                        selfObj.currentChannel = nextCh
                        if selfObj.startChannel ~= nil then return selfObj:startChannel(nextCh) end
                    elseif methodName == "previousChannel" then
                        local curr = selfObj.currentChannel or (total + 1)
                        local prevCh = curr - 1
                        if prevCh < 1 or prevCh > total then prevCh = total end
                        selfObj.currentChannel = prevCh
                        if selfObj.startChannel ~= nil then return selfObj:startChannel(prevCh) end
                    end
                end
                return orig(selfObj, ...)
            end
            print(string.format("[MTRadioManager] Wrapped %s.%s successfully.", className, methodName))
        end
    end

    wrapMethod("startChannel")
    wrapMethod("setChannel")
    wrapMethod("playChannel")
    wrapMethod("nextChannel")
    wrapMethod("previousChannel")
    wrapMethod("play")
    wrapMethod("update")
    wrapMethod("getChannelName")
    wrapMethod("getItemName")
    wrapMethod("initializeSoundPlayer")
end

function MTRadioManager:initHooks()
    if self.isInitialized then return end
    self.isInitialized = true

    self:loadConfiguration()

    if RadioManager ~= nil then self:hookClass("RadioManager", RadioManager) end
    if SoundPlayer ~= nil then self:hookClass("SoundPlayer", SoundPlayer) end
    if Radio ~= nil then self:hookClass("Radio", Radio) end

    print("[MTRadioManager] Radio subsystem hooks initialization completed.")
end

function MTRadioManager:loadMap(mapName)
    self:loadConfiguration()
    if g_soundPlayer ~= nil then
        g_soundPlayer.mtFiltered = nil
        MTRadioManager:filterChannels(g_soundPlayer)
    end
    if g_currentMission ~= nil then
        if g_currentMission.soundPlayer ~= nil then
            g_currentMission.soundPlayer.mtFiltered = nil
            MTRadioManager:filterChannels(g_currentMission.soundPlayer)
        end
        if g_currentMission.radio ~= nil then
            g_currentMission.radio.mtFiltered = nil
            MTRadioManager:filterChannels(g_currentMission.radio)
        end
    end
end

addModEventListener(MTRadioManager)
MTRadioManager:initHooks()

