# StremCompat for Samsung Tizen (test version)

> **This is a test version.** It has only been tested on one TV (Samsung UN75NU7100, Tizen 4.0), so expect problems. **The stable version is the one for LG webOS.**

This test version brings StremCompat for LG 4.0.2 to older Samsung TVs that cannot install the official Stremio app. It works with your Stremio or Nuvio account and addons.

**New since test version 3:**
- The fixes of LG 4.0.1 and 4.0.2: clearer Settings wording, Sign out in red, Nuvio account shown as such, and seeking in large MKV files with a chained index.
- The Nuvio QR code and other text decoding now work on the TV's older runtime.

Install it over test version 3: the TV keeps the app and its settings.

## Which TVs

| Samsung TVs | Tizen | Status |
|---|---|---|
| 2018, N series | 4.0 | Tested on one TV |
| 2017, M series | 3.0 | Should work, not tested yet |
| 2019 and 2020, R and T series | 5.0 and 5.5 | May work, not tested |
| 2021 and 2022 | 6.0 and 6.5 | May work, not tested; these TVs can use the official Stremio app |
| 2023 and newer | 7.0 and newer | Not tested; the package has to be signed again with your own Samsung certificate |
| 2015 and 2016 | 2.x | Not supported |

Check your version in **Settings > Support > About This TV**, or by your model's year.

## What is different from the LG version

- **Torrents** need a streaming server on another computer: **Settings > Streaming server > Address**. The TV cannot run the server by itself in this version. Debrid and direct links work without one.
- **Not available:** seek previews, technical badges on the paused screen and background trailers.
- **Video** plays through the TV's own player, which also lists the file's audio and subtitle tracks.

## How to install

Root is not needed. You need a computer on the same network as the TV.

1. **On the TV:** open **Apps** and type `12345` on the remote. Turn **Developer mode** on, enter your computer's IP address, and restart the TV.
2. **On the computer:** install [Samsung's Tizen CLI tools](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).
3. **Connect to the TV**, using its IP address from **Settings > General > Network > Network Status**:

   ```powershell
   C:\tizen-studio\tools\sdb.exe connect TV_IP
   C:\tizen-studio\tools\sdb.exe devices
   ```

4. **Install the package**, from the folder where you saved it. `TV_NAME` is the name shown by `sdb devices`, such as `UN75NU7100`:

   ```powershell
   C:\tizen-studio\tools\ide\bin\tizen.bat install -n StremCompat-Samsung-Tizen-test-4.wgt -t TV_NAME
   ```

5. Open **StremCompat** from the Apps panel.

These steps have only been used on the TV above, so they may differ on other models.

## Tell me how it went

Please post in [Discussions](https://github.com/Alexesmm/stremcompat-lg-webos/discussions) with your TV model and Tizen version, and whether login, Home, playback, audio and subtitles worked. **Settings > Diagnostics** shows memory, storage and recent problems. Do not post your TV's serial number or addresses.

StremCompat is unofficial and is not affiliated with or endorsed by Stremio, Nuvio, LG or Samsung. It is licensed under GPL-3.0.


