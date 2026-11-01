Player.createData = Utils.overwrittenFunction(Player.createData, function(self, superFunc, ...)
    local playerData = superFunc(self, ...)

    playerData.spawnVehicleUniqueId = nil
    local x, y, z = self:getPosition()
    local yaw = self:getYaw()

    if self:getIsInVehicle() then
        local currentVehicle = self:getCurrentVehicle()
        if currentVehicle ~= nil then
            playerData.spawnVehicleUniqueId = currentVehicle.uniqueId
            local exitPoint = currentVehicle:getExitNode(self)
            if exitPoint ~= nil then
                x, y, z = getWorldTranslation(exitPoint)
                local dx, _, dz = localDirectionToWorld(exitPoint, 0, 0, 1)
                yaw = MathUtil.getYRotationFromDirection(dx, dz)
            end
        end
    end

    playerData.spawnPositionX = x
    playerData.spawnPositionY = y
    playerData.spawnPositionZ = z
    playerData.spawnYaw = yaw

    return playerData
end)

PlayerMover.teleportToSpawnPoint = Utils.prependedFunction(PlayerMover.teleportToSpawnPoint, function(self)
    if self.player ~= nil and self.player.spawnVehicle ~= nil then
        local exitPoint = self.player.spawnVehicle:getExitNode(self.player)
        if exitPoint ~= nil then
            local x, _, z = getWorldTranslation(exitPoint)
            if MathUtil.getPointPointDistance(self.player.spawnPositionX, self.player.spawnPositionZ, x, z) >= 0.1 then
                self.player.spawnVehicle = nil
            end
        end
    end


---- workaround for requestToEnterVehicle called on the server will put the server into the vehicle
    if self.player ~= nil and self.player.spawnVehicle ~= nil and not self.player.isOwner then
        self.player.spawnVehicleTmp = self.player.spawnVehicle
        self.player.spawnVehicle = nil
    end
----
end)


---- workaround for requestToEnterVehicle called on the server will put the server into the vehicle
Player.writeStream = Utils.prependedFunction(Player.writeStream, function(self, streamId, connection)
    if streamWriteBool(streamId, self.spawnVehicleTmp ~= nil) then
        NetworkUtil.writeNodeObject(streamId, self.spawnVehicleTmp)
        self.spawnVehicleTmp = nil
    end
end)

Player.readStream = Utils.prependedFunction(Player.readStream, function(self, streamId, connection, objectId)
    if streamReadBool(streamId) then
        self.spawnVehicle = NetworkUtil.readNodeObject(streamId)
    end
end)
----