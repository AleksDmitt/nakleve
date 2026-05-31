import React from "react";
import * as ReactDOM from "react-dom";
import { YANDEX_MAPS_API_KEY } from "../config/yandexMaps";

let loadPromise = null;

export async function loadYandexReactify() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('script[data-yandex-maps="true"]')) {
      const script = document.createElement("script");
      script.src = `https://api-maps.yandex.ru/v3/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU`;
      script.async = true;
      script.dataset.yandexMaps = "true";

      script.onload = () => {
        console.log("Yandex Maps script loaded");
      };

      script.onerror = () => {
        console.error("Yandex Maps script failed to load");
        reject(new Error("Не удалось загрузить Yandex Maps API"));
      };

      document.head.appendChild(script);
    }

    const wait = async () => {
      try {
        if (!window.ymaps3) {
          setTimeout(wait, 100);
          return;
        }

        console.log("window.ymaps3 found");

        await window.ymaps3.ready;
        console.log("ymaps3 ready");

        const ymaps3React = await window.ymaps3.import("@yandex/ymaps3-reactify");
        console.log("reactify module loaded");

        const reactify = ymaps3React.reactify.bindTo(React, ReactDOM);

        resolve({
          ymaps3: window.ymaps3,
          reactify,
        });
      } catch (err) {
        console.error("loadYandexReactify error:", err);
        reject(err);
      }
    };

    wait();
  });

  return loadPromise;
}