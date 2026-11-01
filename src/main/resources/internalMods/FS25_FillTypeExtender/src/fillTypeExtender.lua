local g_modName = g_currentModName
local g_modPath = g_currentModDirectory

-- Expand FillType network & registry bitstream from 255 to 511
if FillTypeManager and FillTypeManager.SEND_NUM_BITS and FillTypeManager.SEND_NUM_BITS < 9 then
    FillTypeManager.SEND_NUM_BITS = 9
    print(string.format("[%s] FillTypeManager limit safely expanded to 511 fillTypes.", tostring(g_modName or "FS25_FillTypeExtender")))
end
