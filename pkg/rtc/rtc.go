package rtc

import (
	"fmt"
	"sync"
	"time"

	"github.com/pion/ion/pkg/log"
	"github.com/pion/ion/pkg/rtc/plugins"
	"github.com/pion/ion/pkg/rtc/rtpengine"
	"github.com/pion/ion/pkg/rtc/transport"
)

const (
	statCycle    = 3 * time.Second
	maxCleanSize = 100
)

var (
	routers    = make(map[string]*Router)
	routerLock sync.RWMutex

	//CleanChannel return the dead pub's mid
	CleanChannel = make(chan string, maxCleanSize)
)

// Init port and ice urls
func Init(port int, ices []string) {

	//init ice
	transport.InitICE(ices)

	// show stat about all pipelines
	go check()

	// accept relay conn
	connCh := rtpengine.Serve(port)
	go func() {
		for {
			select {
			case conn := <-connCh:
				t := transport.NewRTPTransport(conn)
				mid := t.GetMID()
				cnt := 0
				for mid == "" && cnt < 10 {
					mid = t.GetMID()
					time.Sleep(time.Millisecond)
					cnt++
				}
				if mid == "" && cnt >= 10 {
					log.Infof("mid == \"\" && cnt >=10 return")
					return
				}
				log.Infof("accept new rtp mid=%s conn=%s", mid, conn.RemoteAddr().String())
				if router := AddRouter(mid); router != nil {
					router.AddPub(mid, t)
				}
			}
		}
	}()
}

// GetOrNewRouter get router from map
func GetOrNewRouter(id string) *Router {
	log.Infof("rtc.GetOrNewRouter id=%s", id)
	router := GetRouter(id)
	if router == nil {
		return AddRouter(id)
	}
	return router
}

// GetRouter get router from map
func GetRouter(id string) *Router {
	log.Infof("rtc.GetRouter id=%s", id)
	routerLock.RLock()
	defer routerLock.RUnlock()
	return routers[id]
}

// AddRouter add a new router
func AddRouter(id string) *Router {
	log.Infof("rtc.AddRouter id=%s", id)
	routerLock.Lock()
	defer routerLock.Unlock()
	routers[id] = NewRouter(id)
	return routers[id]
}

// DelRouter delete pub
func DelRouter(id string) {
	log.Infof("DelRouter id=%s", id)
	router := GetRouter(id)
	if router == nil {
		return
	}
	router.Close()
	routerLock.Lock()
	defer routerLock.Unlock()
	delete(routers, id)
}

// Close close all Router
func Close() {
	routerLock.Lock()
	defer routerLock.Unlock()
	for id, router := range routers {
		if router != nil {
			router.Close()
			delete(routers, id)
		}
	}
}

// check show all Routers' stat
func check() {
	t := time.NewTicker(statCycle)
	for range t.C {
		info := "\n----------------rtc-----------------\n"
		routerLock.Lock()

		for id, Router := range routers {
			if !Router.IsLive() {
				Router.Close()
				delete(routers, id)
				CleanChannel <- id
				log.Infof("Stat delete %v", id)
			}
			info += "pub: " + id + "\n"
			info += Router.GetPlugin(jbPlugin).(*plugins.JitterBuffer).Stat()
			subs := Router.GetSubs()
			if len(subs) < 6 {
				for id := range subs {
					info += fmt.Sprintf("sub: %s\n\n", id)
				}
			} else {
				info += fmt.Sprintf("subs: %d\n\n", len(subs))
			}
		}
		routerLock.Unlock()
		log.Infof(info)
	}
}