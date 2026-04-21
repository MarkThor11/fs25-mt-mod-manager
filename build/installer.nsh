!macro customInit
  ; This macro runs before the installer starts
  ; We can check for previous versions and uninstall them silently
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.fs25.modhub-manager" "UninstallString"
  StrCmp $R0 "" done
  
  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "A previous version of FS25 MT Mod Manager was detected. The installer will now uninstall it to ensure a clean installation." /SD IDOK IDOK +1 IDCANCEL cancel
  
  DetailPrint "Uninstalling previous version..."
  ExecWait '"$R0" /S _?=$INSTDIR'
  Goto done

cancel:
  Abort

done:
!macroend
