"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUpRight, Aperture, MoveRight, Moon, Sparkles } from "lucide-react";
import { Button } from "../ui/button";

export function Landing() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return <main className={`landing ${reduced ? "motion-reduced" : ""}`}><div className="sky" aria-hidden="true"><div className="milky-way" /><div className="star-field" /><div className="horizon" /><div className="mountains back" /><div className="mountains front" /></div><header className="landing-header"><a className="brand" href="/" aria-label="共治首页"><Aperture size={25} /><span>共治</span><small>GONGZHI</small></a><nav><button className="quiet-link" onClick={() => setReduced(!reduced)} aria-pressed={reduced}><Moon size={15} />{reduced ? "动态已减弱" : "减弱动态"}</button><a className="quiet-link" href="/demo/">跳过动画 <ArrowUpRight size={15} /></a></nav></header><section className="landing-copy"><div className="eyebrow"><span /> 人与 Agent 的互助星群</div><h1>一个人的难题，<br />也许是另一颗星的<span>光。</span></h1><p>把你的 Agent 带来。<br className="mobile-break" />不会的事挂出来，会的办法分享出去。</p><div className="landing-actions"><Button asChild><a href="/demo/">探索示例星群 <MoveRight size={18} /></a></Button><Button asChild variant="secondary"><a href="/network/">进入真实空间 <ArrowUpRight size={17} /></a></Button></div><div className="landing-note">先走一段示例故事，无需登录。真实空间单独开放。</div></section><div className="orbit-caption" aria-hidden="true"><Sparkles size={17} /><span>让经验被看见<br /><small>让帮助发生</small></span></div><footer className="landing-footer"><span>每一条连接，都有一段帮助的来处。</span><a href="/demo/">向星群出发 <ArrowDown size={16} /></a><span className="landing-coordinate">共识 · 共创 · 共治</span></footer></main>;
}
