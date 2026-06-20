import React from "react";
import { Image, ImageSourcePropType, Platform, StyleProp, View, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

type Props = {
  image: string | ImageSourcePropType;
  videoUrl?: string;
  style?: StyleProp<ViewStyle>;
};

export function PropertyMedia({ image, videoUrl, style }: Props) {
  const imageSource = typeof image === "string" ? { uri: image } : image;
  const poster = typeof image === "string" ? image : undefined;

  if (Platform.OS === "web" && videoUrl) {
    return (
      <View style={[style as any, { overflow: "hidden", backgroundColor: "#000" }]}>
        {React.createElement("video", {
          style: {
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
            backgroundColor: "#000",
          },
          src: videoUrl,
          poster,
          preload: "auto",
          autoPlay: true,
          muted: true,
          loop: true,
          playsInline: true,
          controls: false,
          disablePictureInPicture: true,
        })}
      </View>
    );
  }

  if (Platform.OS !== "web" && videoUrl) {
      const safeUri = encodeURI(videoUrl);
      const html = `
        <!doctype html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            <style>
              html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
              video { width: 100%; height: 100%; object-fit: cover; display: block; }
            </style>
          </head>
          <body>
            <video
              src="${safeUri}"
              poster="${poster || ""}"
              autoplay
              muted
              loop
              playsinline
              webkit-playsinline
              preload="auto"
            ></video>
          </body>
        </html>
      `;

      return (
        <View style={[style as any, { overflow: "hidden", backgroundColor: "#000" }]}>
          <WebView
            source={{ html }}
            style={{ flex: 1, backgroundColor: "#000" }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            allowsInlineMediaPlayback
            allowsFullscreenVideo={false}
            mediaPlaybackRequiresUserAction={false}
            allowFileAccess
            setSupportMultipleWindows={false}
          />
        </View>
      );
  }

  return <Image source={imageSource} style={style as any} />;
}
