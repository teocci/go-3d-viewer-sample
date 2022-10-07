// Package webserver
// Created by RTT.
// Author: teocci@yandex.com on 2022-Apr-26
package webserver

import (
	"embed"
	"fmt"
	"log"
	"mime"
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/teocci/go-3d-viewer-sample/src/config"
)

const (
	defaultProtocol        = "http"
	defaultPage            = "page.html"
	defaultFaviconRoute    = "/favicon.ico"
	defaultFaviconFilePath = "web/static/favicon.ico"

	formatAddress        = "%s:%d"
	formatURL            = "%s://%s/%s"
	formatRelativePath   = "/%s"
	formatStaticFilePath = "web/static/%s"
)

var (
	f       embed.FS
	address string
)

func Start() {
	address = fmt.Sprintf(formatAddress, "", config.Data.Web.Port)
	gin.SetMode(gin.ReleaseMode)
	_ = mime.AddExtensionType(".js", "application/javascript")

	router := gin.Default()
	router.LoadHTMLGlob("web/templates/*")

	indexRoute := fmt.Sprintf(formatRelativePath, defaultPage)
	indexFilePath := fmt.Sprintf(formatStaticFilePath, defaultPage)

	router.StaticFS("/3d", http.Dir("web/static/3d"))
	router.StaticFS("/css", http.Dir("web/static/css"))
	router.StaticFS("/glsl", http.Dir("web/static/glsl"))
	router.StaticFS("/img", http.Dir("web/static/img"))
	router.StaticFS("/js", http.Dir("web/static/js"))

	router.StaticFile(indexRoute, indexFilePath)
	router.StaticFile(defaultFaviconRoute, defaultFaviconFilePath)

	router.Use(CORSMiddleware())

	fmt.Println("[url]", urlFormat(address))

	err := router.Run(address)
	if err != nil {
		log.Fatalln("Start HTTP Server error", err)
	}
}

func GetLocalIp() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "localhost"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)

	return localAddr.IP.String()
}

func addressFormat(a string) string {
	s := strings.Split(a, ":")
	if s[0] == "" {
		s[0] = GetLocalIp()
	}
	return strings.Join(s[:], ":")
}

func urlFormat(a string) string {
	host := addressFormat(a)
	s := fmt.Sprintf(formatURL, defaultProtocol, host, defaultPage)

	return s
}
