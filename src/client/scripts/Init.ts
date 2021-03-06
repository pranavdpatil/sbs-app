﻿/// <reference path="tsdef/jquery.d.ts"/>
/// <reference path="tsdef/jquerymobile.d.ts"/>
/// <reference path="tsdef/knockout-3.3.d.ts"/>
/// <reference path="AppState.ts" />
/// <reference path="Telemetry.ts"/>
/// <reference path="Utils.ts"/>
/// <reference path="stopbystop-interfaces.ts"/>
/// <reference path="InitUrls.ts"/>
/// <reference path="InitHome.ts"/>
/// <reference path="ViewModels/IAppViewModel.ts" />
/// <reference path="ViewModels/AppViewModel.ts" />
/// <reference path="ViewModels/RouteViewModel.ts" />
/// <reference path="ViewModels/JunctionAppViewModel.ts" />


module StopByStop {

    export class Init {
        private static _app: KnockoutObservable<AppViewModel>;
        private static _currentRouteId: string;
        private static _initSPAOnce = Utils.runOnce(Init.initSPA);

        public static initialize(settings: IAppState): void {
            AppState.current = settings;
            AppState.current.urls = new InitUrls(settings.baseDataUrl, settings.baseImageUrl);
            Init._app = ko.observable<AppViewModel>(new AppViewModel(null));

            (<any>ko).options.deferUpdates = true;
            Init.enableUAMatch();


            /* common initialization for all pages */
            $(document).on("pageinit", ".jqm-demos", (event) => {
                var page = $(this);


                if (AppState.current.app === SBSApp.SPA) {
                    Init._initSPAOnce();
                }


                /* For Web app initialize menu programmatically*/
                if (AppState.current.app === SBSApp.Web) {
                    $(".jqm-navmenu-panel ul").listview();
                    $(".jqm-navmenu-link").on("click", () => {
                        (<any>page.find(".jqm-navmenu-panel:not(.jqm-panel-page-nav)")).panel().panel("open");
                    });
                }

                // Initialize breadcrumb on applicable pages
                jQuery(document).ready(() => {
                    (<any>jQuery("#breadCrumb0")).jBreadCrumb();
                })

                // wire up click on the social button
                $(".social-btn").click(() => {
                    Telemetry.trackEvent(TelemetryEvent.SocialButtonClick);
                });

                $(".filter-btn").click(() => {
                    Telemetry.trackEvent(TelemetryEvent.FilterButtonClick);
                });

            });
            /* end of common initialiazation for all pages */

            /* home page initialization */
            $(document).on("pageinit", ".sbs-homePG", function (event) {
                InitHome.wireup();
            });
            /* end of home page initialization */


            /* route page initialization */
            $(document).on("pageinit", ".route-page", function (event) {


            });
            /* end of route page initialization */

            /* exit page initialization */
            $(document).on("pageinit", ".exit-page", function (event) {

            });
            /* end of exit page initialization */

            /* poi group page initialization */
            $(document).on("pageinit", ".poigroup-page", function (event) {

                var poiGroupInitialized = false;
                $(document).scroll(function () {
                    if (!poiGroupInitialized) {
                        poiGroupInitialized = true;
                        Telemetry.trackEvent(TelemetryEvent.POIGroupPageScroll);
                    }
                });
            });
            /* end of poi group page initialization */

            /* handle unknown hash change */
            var scheduledUnknownChange = false;
            (<any>$(window)).hashchange(() => {
                if (!scheduledUnknownChange) {
                    scheduledUnknownChange = true;
                    window.setTimeout(() => {
                        if (!AppState.current.knownHashChangeInProgress) {
                            var newHash = location.hash;
                            var oldPage = AppState.current.navigationLocation.page;

                            Utils.updateNavigationLocation(newHash, AppState.current.navigationLocation);
                            if (oldPage !== AppState.current.navigationLocation.page) {
                                Utils.spaPageNavigate(
                                    AppState.current.navigationLocation.page,
                                    AppState.current.navigationLocation.routeId,
                                    AppState.current.navigationLocation.exitId,
                                    AppState.current.navigationLocation.poiType,
                                    false);

                            }
                        }

                        AppState.current.knownHashChangeInProgress = false;
                        scheduledUnknownChange = false;
                    }, 100);
                }
            });

            /* trigger initial hash change */
            (<any>$(window)).hashchange();
        }

        private static loadRoute(routeId: string): JQueryPromise<any> {
            var deferred = $.Deferred();

            $.ajax({
                url: AppState.current.urls.RouteDataUrl + routeId,
                dataType: 'json',
                method: 'GET',
                success: function (data) {
                    var route = <IRoute>data;
                    var app = new AppViewModel(route, AppState.current, () => {
                        deferred.resolve();
                    });
                    Init._app(app);
                }
            });

            return deferred.promise();
        }

        private static completeExitPageInit(): void {
            var selectedRouteJunction = Init._app().routePlan.junctionMap[AppState.current.navigationLocation.exitId];
            var poiType = AppState.current.navigationLocation.poiType;

            var appViewModel = Init._app();

            var junctionAppViewModel = new JunctionSPAAppViewModel(
                appViewModel.route.route,
                selectedRouteJunction,
                appViewModel.filter,
                appViewModel.routePlan,
                poiType);

            appViewModel.selectedJunction(junctionAppViewModel);

            Init.initJunctionMapWhenReady(junctionAppViewModel).then((jmmv) => {
                // to ensure the switch between map and list view is initialized
                $(".view-mode-switch").controlgroup();
                $(".view-mode-switch").trigger("create");
                Init.wireupPOIGroup(jmmv);

            })

            Init._app().url(location.toString());
            Init._app().title(junctionAppViewModel.routeJunction.title);
            document.title = Init._app().title();
        }

        private static initSPA(): void {
            /* apply root bindings for Cordova app */
            var sbsRootNode = $("#sbsRoot")[0];
            ko.applyBindings(Init._app, sbsRootNode);
            /* initialize UI */
            $(".filter-btn").click(() => Init.openFilterPopup());
            $(".jqm-navmenu-link").click(() => Init.openNavigationMenu());

            /* initialize page navigation events */
            var pageBeforeShowTime: number;
            var navigationAbandoned = false;

            $.mobile.pageContainer.pagecontainer({
                beforeshow: (event, ui) => {
                    navigationAbandoned = false;
                    pageBeforeShowTime = new Date().getTime();
                    var pageBeingLoaded = ui.toPage.attr("id");

                    var pageIdSelector: string = "#" + pageBeingLoaded;


                    if (!AppState.current.navigationLocation) {
                        AppState.current.navigationLocation = { page: SBSPage.home };
                    }

                    Utils.updateNavigationLocation(location.hash, AppState.current.navigationLocation);
                    var updatedHash = Utils.getHashFromNavigationLocation(AppState.current.navigationLocation);

                    if (location.hash !== updatedHash) {
                        AppState.current.knownHashChangeInProgress = true;
                        location.replace(updatedHash);
                    }

                    AppState.current.pageInfo = {
                        pageName: ui.toPage.data("page-name"),
                        telemetryPageName: ui.toPage.data("telemetry-page-name"),
                    };


                    // are we loading correct page?
                    var pageBeingLoaded = ui.toPage[0].id;
                    if (SBSPage[AppState.current.navigationLocation.page] !== pageBeingLoaded) {
                        Utils.spaPageNavigate(
                            AppState.current.navigationLocation.page,
                            AppState.current.navigationLocation.routeId,
                            AppState.current.navigationLocation.exitId,
                            AppState.current.navigationLocation.poiType,
                            false);

                        navigationAbandoned = true;
                    }


                    <any>$(pageIdSelector).css(
                        {
                            paddingTop: "51px",
                            paddingBottom: "50px"
                        });

                    /*
                    (<any>$("#sbsheader")
                        .prependTo(pageIdSelector))
                        .toolbar({ position: "fixed" });

                    (<any>$("#menupanel")
                        .appendTo(pageIdSelector))
                        .panel();

                    $("#menupanel-list").listview();
                    $("#menupanel-list>li a").removeClass("ui-btn-active");

                    (<any>$("#sbsfooter")
                        .appendTo(pageIdSelector))
                        .toolbar({ position: "fixed" });

                    (<any>$.mobile).resetActivePageHeight();

                    <any>$(pageIdSelector).css(
                        {
                            paddingTop: "51px",
                            paddingBottom: "50px"
                        });

                    */

                },
                show: (event, ui) => {
                    if (navigationAbandoned) {
                        return;
                    }

                    
                    switch (AppState.current.navigationLocation.page) {
                        case SBSPage.route:
                        case SBSPage.exit:
                            $(".filter-btn").show();
                            if (Init._currentRouteId !== AppState.current.navigationLocation.routeId) {
                                Init._currentRouteId = AppState.current.navigationLocation.routeId;

                                Init._app(new AppViewModel(null));

                                Init.loadRoute(AppState.current.navigationLocation.routeId).done(() => {
                                    if (AppState.current.navigationLocation.page === SBSPage.exit) {
                                        Init.completeExitPageInit();
                                    }
                                });
                            } else {
                                this._app().url(location.toString());
                                if (AppState.current.navigationLocation.page === SBSPage.route) {

                                    this._app().route.recalcRoadLine($(".route")[0]);
                                    this._app().title(this._app().route.shortDescription);
                                    
                                } else if (AppState.current.navigationLocation.page === SBSPage.exit) {
                                    Init.completeExitPageInit();
                                }

                               
                            }
                            break;
                        default:
                            $(".filter-btn").hide();
                            break;
                    }


                    // this is a hack. But I am not sure why this class is added despite the fact that
                    // sbsheader is added with {position:fixed}
                    // $("#sbsheader").removeClass("ui-fixed-hidden");

                    Telemetry.trackPageView(
                        AppState.current.pageInfo.telemetryPageName,
                        "#" + AppState.current.pageInfo.pageName,
                        (new Date()).getTime() - pageBeforeShowTime);
                }
            });
        }

        private static initJunctionMapWhenReady(junctionAppViewModel: JunctionSPAAppViewModel): JQueryPromise<JunctionMapViewModel> {
            var dfd = jQuery.Deferred();
            var mapElement = $("#map")[0];
            var mapContainerElement = $(".poi-map")[0];

            if (mapElement && mapContainerElement) {
                var junctionMapViewModel = junctionAppViewModel.initMap(mapElement, mapContainerElement);
                dfd.resolve(junctionMapViewModel);
            } else {
                window.setTimeout(() => {
                    Init.initJunctionMapWhenReady(junctionAppViewModel)
                        .then((jmvm) => dfd.resolve(jmvm));
                }, 50);
            }

            return dfd.promise();
        }

        private static wireupPOIGroup(jmvm: JunctionMapViewModel): void {
            $(".view-mode-switch").on("change", function () {
                var modeVal = $(".view-mode-switch :radio:checked").val();
                if (modeVal === "list") {
                    $(".poi-table").show();
                    $(".poi-map").hide();
                    Telemetry.trackEvent(TelemetryEvent.POIGroupSwitchList);
                }
                else {
                    $(".poi-table").hide();
                    $(".poi-map").show();
                    jmvm.initMapDiv();
                    Telemetry.trackEvent(TelemetryEvent.POIGroupSwitchMap);
                }
            });

            $(".yelp-btn").on("click", function () {
                Telemetry.trackEvent(TelemetryEvent.YelpLinkClick, null, null, true);
            });

            $(".tel-btn").on("click", function () {
                Telemetry.trackEvent(TelemetryEvent.TelLinkClick);
            });
        };

        private static enableUAMatch(): void {

            /* UA MATCH */
            var matched, browser;
            jQuery["uaMatch"] = function (ua) {
                ua = ua.toLowerCase();

                var match = /(chrome)[ \/]([\w.]+)/.exec(ua) ||
                    /(webkit)[ \/]([\w.]+)/.exec(ua) ||
                    /(opera)(?:.*version|)[ \/]([\w.]+)/.exec(ua) ||
                    /(msie) ([\w.]+)/.exec(ua) ||
                    ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
                    [];

                return {
                    browser: match[1] || "",
                    version: match[2] || "0"
                };
            };

            matched = jQuery["uaMatch"](navigator.userAgent);
            browser = {};

            if (matched.browser) {
                browser[matched.browser] = true;
                browser.version = matched.version;
            }

            // Chrome is Webkit, but Webkit is also Safari.
            if (browser.chrome) {
                browser.webkit = true;
            } else if (browser.webkit) {
                browser.safari = true;
            }

            jQuery["browser"] = browser;

            /* END OF UA_MATCH */
        }

        public static openNavigationMenu(): void {
            var fd = $("." + AppState.current.pageInfo.pageName + " .nav-menu")
            if (fd.length > 0) {
                (<any>fd).panel();
                fd.trigger("create");
                (<any>fd).panel("open");
            }
        }

        public static openFilterPopup(): void {
            var fd = $("." + AppState.current.pageInfo.pageName + " .filter-dlg")
            if (fd.length > 0) {
                fd.popup();
                fd.trigger("create");
                fd.popup("open", {
                    positionTo: "origin",
                    transition: "slidedown"
                });
            }
        }
    }
}